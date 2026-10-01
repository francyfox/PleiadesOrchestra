import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ORIGIN, testApp } from "../../app.testing.ts";
import { createOrchestratorClient } from "../orchestrator/orchestrator.ts";

type Message = { type: string; id: string; data?: unknown; code?: string };

let t: ReturnType<typeof testApp>;
let cookie: string;
let url: string;
/** What the stub orchestrator serves, and how often it was asked. */
let channels: { id: string }[];
let requests: number;
let failing: boolean;

beforeEach(async () => {
	channels = [{ id: "c1" }];
	requests = 0;
	failing = false;
	t = testApp({
		orchestrator: createOrchestratorClient({
			baseUrl: "http://orchestrator",
			apiKey: "admin-key",
			fetch: (async (input: string | URL | Request) => {
				requests++;
				if (failing) return new Response("down", { status: 502 });
				const path = new URL(String(input)).pathname;
				if (path.endsWith("/channels")) {
					return Response.json({ items: channels, total: channels.length });
				}
				return Response.json({ items: [] });
			}) as unknown as typeof fetch,
		}),
		liveIntervalsMs: { channels: 20, agents: 20 },
	});
	cookie = await t.registerFirst();
	t.app.listen(0);
	url = `ws://localhost:${t.app.server?.port}/api/live`;
});

afterEach(async () => {
	await t.app.stop(true);
});

const upgrade = (headers: Record<string, string>) =>
	fetch(url.replace("ws:", "http:"), {
		headers: {
			connection: "Upgrade",
			upgrade: "websocket",
			"sec-websocket-version": "13",
			"sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
			...headers,
		},
	});

async function connect(
	headers: Record<string, string> = { cookie, origin: ORIGIN },
) {
	const socket = new WebSocket(url, { headers } as never);
	const messages: Message[] = [];
	socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
	await new Promise<void>((resolve, reject) => {
		socket.onopen = () => resolve();
		socket.onerror = () => reject(new Error("ws refused"));
	});
	const send = (message: unknown) =>
		socket.send(
			typeof message === "string" ? message : JSON.stringify(message),
		);
	return { socket, messages, send };
}

describe("GET /api/live: access", () => {
	test("refuses the upgrade without a session", async () => {
		expect((await upgrade({ origin: ORIGIN })).status).toBe(401);
	});

	test("refuses the upgrade from a foreign Origin", async () => {
		expect(
			(await upgrade({ cookie, origin: "http://evil.example" })).status,
		).toBe(403);
	});

	test("an origin-less client with a session is let in", async () => {
		const { socket } = await connect({ cookie });
		socket.close();
	});
});

describe("GET /api/live: subscriptions", () => {
	test("subscribe delivers the snapshot, then only changes, and unsubscribe silences it", async () => {
		const { socket, messages, send } = await connect();
		send({ type: "subscribe", id: "page", topic: "channels", params: {} });
		await Bun.sleep(120);
		expect(messages).toEqual([
			{ type: "data", id: "page", data: { items: [{ id: "c1" }], total: 1 } },
		]);

		channels = [{ id: "c1" }, { id: "c2" }];
		await Bun.sleep(80);
		expect(messages).toHaveLength(2);
		expect(messages[1]).toMatchObject({
			type: "data",
			id: "page",
			data: { total: 2 },
		});

		send({ type: "unsubscribe", id: "page" });
		await Bun.sleep(40);
		const settled = requests;
		channels = [{ id: "c3" }];
		await Bun.sleep(100);
		expect(requests).toBe(settled);
		expect(messages).toHaveLength(2);
		socket.close();
	});

	test("two subscriptions on one socket are independent, by id", async () => {
		const { socket, messages, send } = await connect();
		send({ type: "subscribe", id: "a", topic: "channels", params: {} });
		send({ type: "subscribe", id: "b", topic: "agents", params: {} });
		await Bun.sleep(100);
		expect(messages.map((m) => m.id).sort()).toEqual(["a", "b"]);
		send({ type: "unsubscribe", id: "a" });
		await Bun.sleep(30);
		channels = [{ id: "c9" }];
		await Bun.sleep(80);
		expect(messages.filter((m) => m.id === "a")).toHaveLength(1);
		socket.close();
	});

	test("subscribing again with the same id replaces the subscription", async () => {
		const { socket, messages, send } = await connect();
		send({
			type: "subscribe",
			id: "page",
			topic: "channels",
			params: { page: 1, pageSize: 5 },
		});
		await Bun.sleep(80);
		send({ type: "subscribe", id: "page", topic: "agents", params: {} });
		await Bun.sleep(80);
		expect(
			messages.map(
				(m) => (m.data as { items?: unknown[] })?.items !== undefined,
			),
		).toEqual([true, true]);
		channels = [{ id: "later" }];
		await Bun.sleep(80);
		// only the agents subscription is alive: no channel snapshot arrives
		expect(messages).toHaveLength(2);
		socket.close();
	});

	test("closing the socket stops the upstream fetching", async () => {
		const { socket, send } = await connect();
		send({ type: "subscribe", id: "page", topic: "channels", params: {} });
		await Bun.sleep(80);
		socket.close();
		await Bun.sleep(60);
		const settled = requests;
		await Bun.sleep(100);
		expect(requests).toBe(settled);
	});

	test("an outage is reported once and the data comes back after it", async () => {
		const { socket, messages, send } = await connect();
		send({ type: "subscribe", id: "page", topic: "channels", params: {} });
		await Bun.sleep(80);
		failing = true;
		await Bun.sleep(120);
		expect(messages.map((m) => m.type)).toEqual(["data", "error"]);
		expect(messages[1]).toEqual({
			type: "error",
			id: "page",
			code: "upstream",
		});
		failing = false;
		await Bun.sleep(80);
		expect(messages.map((m) => m.type)).toEqual(["data", "error", "data"]);
		socket.close();
	});
});

describe("GET /api/live: bad input never closes the socket", () => {
	test("unknown topic, invalid params, malformed JSON, malformed messages", async () => {
		const { socket, messages, send } = await connect();
		send({ type: "subscribe", id: "x", topic: "nope", params: {} });
		send({
			type: "subscribe",
			id: "y",
			topic: "users",
			params: { status: "zzz" },
		});
		send({
			type: "subscribe",
			id: "z",
			topic: "channels",
			params: { page: 0 },
		});
		send("{ not json");
		send({ type: "subscribe", topic: "channels", params: {} });
		send({ type: "dance", id: "w" });
		await Bun.sleep(60);
		expect(messages).toEqual([
			{ type: "error", id: "x", code: "unknown_topic" },
			{ type: "error", id: "y", code: "invalid_params" },
			{ type: "error", id: "z", code: "invalid_params" },
			{ type: "error", id: "", code: "invalid_params" },
			{ type: "error", id: "", code: "invalid_params" },
			{ type: "error", id: "w", code: "invalid_params" },
		]);
		// still alive and usable
		send({ type: "subscribe", id: "ok", topic: "channels", params: {} });
		await Bun.sleep(80);
		expect(messages.at(-1)).toMatchObject({ type: "data", id: "ok" });
		socket.close();
	});

	test("a socket may hold only a bounded number of subscriptions", async () => {
		const { socket, messages, send } = await connect();
		for (let i = 0; i < 21; i++) {
			send({
				type: "subscribe",
				id: `s${i}`,
				topic: "channels",
				params: { page: i + 1, pageSize: 1 },
			});
		}
		await Bun.sleep(150);
		const refused = messages.filter((m) => m.type === "error");
		expect(refused).toEqual([
			{ type: "error", id: "s20", code: "invalid_params" },
		]);
		socket.close();
	});
});
