import { afterEach, describe, expect, test } from "bun:test";
import { fakeOrchestrator, ORIGIN, testApp } from "../../app.testing.ts";
import { scopeSubscription } from "./live.service.ts";

type Message = { type: string; id: string; data?: unknown; code?: string };

let t: ReturnType<typeof testApp> | undefined;
afterEach(async () => {
	await t?.app.stop(true);
	t = undefined;
});

async function start() {
	const fake = fakeOrchestrator((call) => {
		const path = new URL(call.path, "http://x").pathname;
		if (path.endsWith("/usage")) return Response.json({ rows: [] });
		if (path.endsWith("/channels"))
			return Response.json({ items: [], total: 0 });
		return Response.json({ visitors: {}, usage: {} });
	});
	t = testApp({
		orchestrator: fake.client,
		liveIntervalsMs: { dashboard: 20, channels: 20 },
	});
	const ann = await t.signedUser("ann@example.com");
	const rows = await t.db.query.user.findMany();
	const annId = rows.find((row) => row.email === "ann@example.com")
		?.id as string;
	t.app.listen(0);
	const socket = new WebSocket(
		`ws://localhost:${t.app.server?.port}/api/live`,
		{
			headers: { cookie: ann, origin: ORIGIN },
		} as never,
	);
	const messages: Message[] = [];
	socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
	await new Promise<void>((resolve, reject) => {
		socket.onopen = () => resolve();
		socket.onerror = () => reject(new Error("ws refused"));
	});
	const send = (message: unknown) => socket.send(JSON.stringify(message));
	return { socket, messages, send, calls: fake.calls, annId };
}

describe("/api/live for a user", () => {
	test("a foreign ownerId param is overwritten by the session's own", async () => {
		const { socket, messages, send, calls, annId } = await start();
		send({
			type: "subscribe",
			id: "d",
			topic: "dashboard",
			params: { ownerId: "someone-else" },
		});
		send({
			type: "subscribe",
			id: "c",
			topic: "channels",
			params: { ownerId: "someone-else" },
		});
		await Bun.sleep(150);
		expect(
			messages
				.filter((m) => m.type === "data")
				.map((m) => m.id)
				.sort(),
		).toEqual(["c", "d"]);
		expect(calls.length).toBeGreaterThan(0);
		expect(calls.some((c) => c.path.includes("/finance"))).toBe(false);
		for (const call of calls) {
			expect(call.path).toContain(`ownerId=${annId}`);
			expect(call.path).not.toContain("someone-else");
		}
		socket.close();
	});

	test("params without an ownerId are scoped too", async () => {
		const { socket, send, calls, annId } = await start();
		send({ type: "subscribe", id: "c", topic: "channels", params: {} });
		await Bun.sleep(100);
		expect(calls.every((c) => c.path.includes(`ownerId=${annId}`))).toBe(true);
		socket.close();
	});

	test("every other topic is forbidden and fetches nothing", async () => {
		const { socket, messages, send, calls } = await start();
		const topics = [
			"visitors",
			"visitor",
			"intents",
			"blocked-ips",
			"admins",
			"agents",
			"performance",
			"requests",
			"request",
			"mcp",
		];
		for (const topic of topics)
			send({ type: "subscribe", id: topic, topic, params: { id: "x" } });
		await Bun.sleep(100);
		expect(messages).toHaveLength(topics.length);
		expect(
			messages.every((m) => m.type === "error" && m.code === "forbidden"),
		).toBe(true);
		expect(calls).toHaveLength(0);
		socket.close();
	});
});

describe("scopeSubscription", () => {
	test("staff pass through, users are scoped", () => {
		expect(
			scopeSubscription({ id: "s", level: 100 }, "visitors", { q: "a" }),
		).toEqual({ ok: true, params: { q: "a" } });
		expect(
			scopeSubscription({ id: "u", level: 200 }, "dashboard", undefined),
		).toEqual({ ok: true, params: { ownerId: "u" } });
		expect(scopeSubscription({ id: "u", level: 200 }, "visitors", {})).toEqual({
			ok: false,
			code: "forbidden",
		});
	});
});
