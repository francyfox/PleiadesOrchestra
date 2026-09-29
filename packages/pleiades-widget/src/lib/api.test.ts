import { describe, expect, test } from "bun:test";
import {
	ApiError,
	createWidgetApi,
	type FetchLike,
	type StreamEvent,
} from "./api";

const enc = new TextEncoder();
const scope = {
	agentUrl: "https://agent.example.com",
	publishableKey: "pk_abcdefghijklmnop",
};

function ndjson(lines: unknown[], chunkSize = 1000): Response {
	const bytes = enc.encode(
		`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
	);
	return new Response(
		new ReadableStream({
			start(controller) {
				for (let i = 0; i < bytes.length; i += chunkSize)
					controller.enqueue(bytes.slice(i, i + chunkSize));
				controller.close();
			},
		}),
	);
}

function recorder(
	respond: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetch: FetchLike = async (url, init) => {
		calls.push({ url, init });
		return respond(url, init);
	};
	return { calls, api: createWidgetApi({ ...scope, fetch }) };
}

const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

async function collect(stream: AsyncGenerator<StreamEvent>) {
	const events: StreamEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe("createWidgetApi", () => {
	test("createVisitor sends the publishable key, and only there", async () => {
		const { api, calls } = recorder(() =>
			Response.json({ visitorToken: "tok", expiresAt: 123 }, { status: 201 }),
		);
		expect(await api.createVisitor()).toEqual({
			visitorToken: "tok",
			expiresAt: 123,
		});
		expect(calls[0]?.url).toBe("https://agent.example.com/v1/widget/visitors");
		expect(calls[0]?.init.method).toBe("POST");
		expect(headersOf(calls[0]?.init as RequestInit)["x-publishable-key"]).toBe(
			scope.publishableKey,
		);
	});

	test("never sends cookies or caches: credentials omitted, no-store", async () => {
		const { api, calls } = recorder(() =>
			Response.json({ visitorToken: "t", expiresAt: 1 }, { status: 201 }),
		);
		await api.createVisitor();
		expect(calls[0]?.init.credentials).toBe("omit");
		expect(calls[0]?.init.cache).toBe("no-store");
	});

	test("createThread and history use the visitor token, not the key", async () => {
		const { api, calls } = recorder((url) =>
			url.endsWith("/threads")
				? Response.json({ threadId: "t1" }, { status: 201 })
				: Response.json({ items: [] }),
		);
		expect(await api.createThread("tok")).toEqual({ threadId: "t1" });
		await api.history("tok", "a/b");
		expect(calls[0]?.url).toBe("https://agent.example.com/v1/widget/threads");
		expect(calls[1]?.url).toBe(
			"https://agent.example.com/v1/widget/threads/a%2Fb/messages",
		);
		for (const call of calls) {
			expect(headersOf(call.init)["x-visitor-token"]).toBe("tok");
			expect(headersOf(call.init)["x-publishable-key"]).toBeUndefined();
		}
	});

	test("streamMessage posts threadId + text and yields the NDJSON events", async () => {
		const { api, calls } = recorder(() =>
			ndjson([
				{ type: "delta", text: "Hi" },
				{ type: "delta", text: "!" },
				{ type: "done", elapsedMs: 5 },
			]),
		);
		const events = await collect(api.streamMessage("tok", "t1", "hello"));
		expect(events.map((event) => event.type)).toEqual([
			"delta",
			"delta",
			"done",
		]);
		expect(calls[0]?.url).toBe("https://agent.example.com/v1/widget/messages");
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
			threadId: "t1",
			text: "hello",
		});
		expect(
			headersOf(calls[0]?.init as RequestInit)["x-publishable-key"],
		).toBeUndefined();
	});

	test("streamMessage includes customerContext in the body when given, and omits it when not", async () => {
		const { api, calls } = recorder(() =>
			ndjson([{ type: "done", elapsedMs: 1 }]),
		);
		await collect(
			api.streamMessage("tok", "t1", "hello", undefined, {
				country: "Kazakhstan",
				city: "Qyzylorda",
			}),
		);
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
			threadId: "t1",
			text: "hello",
			customerContext: { country: "Kazakhstan", city: "Qyzylorda" },
		});

		const noContext = recorder(() => ndjson([{ type: "done", elapsedMs: 1 }]));
		await collect(noContext.api.streamMessage("tok", "t1", "hello"));
		expect(JSON.parse(String(noContext.calls[0]?.init.body))).toEqual({
			threadId: "t1",
			text: "hello",
		});
	});

	test("decodes lines split across chunks, including multi-byte text", async () => {
		const { api } = recorder(() =>
			ndjson(
				[
					{ type: "delta", text: "Привет" },
					{ type: "done", elapsedMs: 1 },
				],
				5,
			),
		);
		const events = await collect(api.streamMessage("tok", "t1", "x"));
		expect(events[0]).toEqual({ type: "delta", text: "Привет" });
	});

	test("an `error` line comes through as an event, not an exception", async () => {
		const { api } = recorder(() =>
			ndjson([{ type: "error", message: "no plan reached the goal" }]),
		);
		expect(await collect(api.streamMessage("tok", "t1", "x"))).toEqual([
			{ type: "error", message: "no plan reached the goal" },
		]);
	});

	test("HTTP failures throw ApiError with the status", async () => {
		for (const status of [401, 403, 404, 413, 429, 500]) {
			const { api } = recorder(() => new Response(null, { status }));
			const error = await collect(api.streamMessage("tok", "t1", "x")).catch(
				(cause) => cause,
			);
			expect(error).toBeInstanceOf(ApiError);
			expect((error as ApiError).status).toBe(status);
		}
	});

	test("a network failure is an ApiError with status 0", async () => {
		const api = createWidgetApi({
			...scope,
			fetch: async () => {
				throw new TypeError("Failed to fetch");
			},
		});
		const error = await api.createVisitor().catch((cause) => cause);
		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).status).toBe(0);
	});

	test("streamMessage passes the signal to fetch", async () => {
		const controller = new AbortController();
		const { api, calls } = recorder(() =>
			ndjson([{ type: "done", elapsedMs: 1 }]),
		);
		await collect(api.streamMessage("tok", "t1", "x", controller.signal));
		expect(calls[0]?.init.signal).toBe(controller.signal);
	});

	test("an abort surfaces as-is, not wrapped in ApiError", async () => {
		const controller = new AbortController();
		const api = createWidgetApi({
			...scope,
			fetch: async () => {
				controller.abort();
				throw Object.assign(new Error("Aborted"), { name: "AbortError" });
			},
		});
		const error = await collect(
			api.streamMessage("tok", "t1", "x", controller.signal),
		).catch((cause) => cause);
		expect(error).not.toBeInstanceOf(ApiError);
		expect((error as Error).name).toBe("AbortError");
	});
});
