import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ORIGIN, SNAPSHOT, testApp } from "../testing.ts";

let t: ReturnType<typeof testApp>;
let cookie: string;
let url: string;
let calls: number;

beforeEach(async () => {
	calls = 0;
	t = testApp({
		systemSnapshot: async () => ({ ...SNAPSHOT, at: ++calls }),
		systemStreamIntervalMs: 20,
	});
	cookie = await t.registerFirst();
	t.app.listen(0);
	url = `ws://localhost:${t.app.server?.port}/api/system/stream`;
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

function open(headers: Record<string, string>) {
	const socket = new WebSocket(url, { headers } as never);
	const messages: { at: number }[] = [];
	socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
	const opened = new Promise<void>((resolve, reject) => {
		socket.onopen = () => resolve();
		socket.onerror = () => reject(new Error("ws refused"));
	});
	return { socket, messages, opened };
}

describe("GET /api/system/stream", () => {
	test("pushes a snapshot right away and then on the interval", async () => {
		const { socket, messages, opened } = open({ cookie, origin: ORIGIN });
		await opened;
		await Bun.sleep(120);
		socket.close();
		expect(messages.length).toBeGreaterThanOrEqual(3);
		expect(messages[0]).toMatchObject({ cpuBusyPercent: 12 });
		expect(messages.map((m) => m.at)).toEqual(
			[...messages.map((m) => m.at)].sort((a, b) => a - b),
		);
	});

	test("stops sampling once the last client is gone", async () => {
		const { socket, opened } = open({ cookie, origin: ORIGIN });
		await opened;
		socket.close();
		await Bun.sleep(60);
		const settled = calls;
		await Bun.sleep(100);
		expect(calls).toBe(settled);
	});

	test("refuses the upgrade without a session", async () => {
		expect((await upgrade({ origin: ORIGIN })).status).toBe(401);
	});

	test("refuses the upgrade from a foreign Origin", async () => {
		const response = await upgrade({ cookie, origin: "http://evil.example" });
		expect(response.status).toBe(403);
	});

	test("an origin-less client with a session is let in", async () => {
		const { socket, opened } = open({ cookie });
		await opened;
		socket.close();
	});
});
