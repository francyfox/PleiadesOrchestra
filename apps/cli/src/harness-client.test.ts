import { describe, expect, test } from "bun:test";
import { createHarnessClient } from "./harness-client.ts";

const BASE_URL = "https://harness.internal";
const API_KEY = "test-api-key";

function fakeFetch(
	handler: (input: string | URL | Request, init?: RequestInit) => Response,
): typeof fetch {
	return (async (input: string | URL | Request, init?: RequestInit) =>
		handler(input, init)) as typeof fetch;
}

/** Builds a streamed NDJSON Response, optionally split across reads at arbitrary byte offsets. */
function ndjsonResponse(lines: string[], splitBytes?: number[]): Response {
	const body = lines.map((line) => `${line}\n`).join("");
	const bytes = new TextEncoder().encode(body);
	const boundaries = splitBytes ?? [bytes.length];

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let offset = 0;
			for (const boundary of boundaries) {
				controller.enqueue(bytes.slice(offset, boundary));
				offset = boundary;
			}
			if (offset < bytes.length) controller.enqueue(bytes.slice(offset));
			controller.close();
		},
	});

	return new Response(stream, {
		headers: { "content-type": "application/x-ndjson" },
	});
}

describe("createHarnessClient", () => {
	test("streamMessage posts to /v1/messages with a bearer token and yields parsed events", async () => {
		let capturedUrl: string | undefined;
		let capturedInit: RequestInit | undefined;

		const client = createHarnessClient({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch((input, init) => {
				capturedUrl = String(input);
				capturedInit = init;
				return ndjsonResponse([
					'{"type":"progress","chunkIndex":0,"totalChunks":1,"elapsedMs":5,"contextChars":2}',
					'{"type":"delta","text":"hi"}',
					'{"type":"done","elapsedMs":12,"inputTokens":10,"outputTokens":2}',
				]);
			}),
		});

		const events = [];
		for await (const event of client.streamMessage({
			threadId: "t1",
			userId: "u1",
			text: "hi",
		})) {
			events.push(event);
		}

		expect(events).toEqual([
			{
				type: "progress",
				chunkIndex: 0,
				totalChunks: 1,
				elapsedMs: 5,
				contextChars: 2,
			},
			{ type: "delta", text: "hi" },
			{ type: "done", elapsedMs: 12, inputTokens: 10, outputTokens: 2 },
		]);
		expect(capturedUrl).toBe(`${BASE_URL}/v1/messages`);
		expect(capturedInit?.method).toBe("POST");
		expect(new Headers(capturedInit?.headers).get("authorization")).toBe(
			`Bearer ${API_KEY}`,
		);
		expect(JSON.parse(String(capturedInit?.body))).toEqual({
			threadId: "t1",
			userId: "u1",
			text: "hi",
			channel: "cli",
		});
	});

	test("streamMessage reassembles NDJSON lines split across multiple stream reads", async () => {
		const line = '{"type":"delta","text":"hello world"}';
		const client = createHarnessClient({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch(() => ndjsonResponse([line], [5, 15])),
		});

		const events = [];
		for await (const event of client.streamMessage({
			threadId: "t1",
			userId: "u1",
			text: "hi",
		})) {
			events.push(event);
		}

		expect(events).toEqual([{ type: "delta", text: "hello world" }]);
	});

	test("streamMessage throws when the stream carries an error event", async () => {
		const client = createHarnessClient({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch(() =>
				ndjsonResponse([
					'{"type":"delta","text":"partial"}',
					'{"type":"error","message":"boom"}',
				]),
			),
		});

		async function collect() {
			const events = [];
			for await (const event of client.streamMessage({
				threadId: "t1",
				userId: "u1",
				text: "hi",
			})) {
				events.push(event);
			}
			return events;
		}

		await expect(collect()).rejects.toThrow("boom");
	});

	test("streamMessage throws on a non-ok response", async () => {
		const client = createHarnessClient({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch(
				() => new Response("boom", { status: 500, statusText: "Server Error" }),
			),
		});

		async function collect() {
			const events = [];
			for await (const event of client.streamMessage({
				threadId: "t1",
				userId: "u1",
				text: "hi",
			})) {
				events.push(event);
			}
			return events;
		}

		await expect(collect()).rejects.toThrow(/500/);
	});

	test("resetThread posts to /v1/threads/:id/reset with the thread id encoded", async () => {
		let capturedUrl: string | undefined;

		const client = createHarnessClient({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch((input) => {
				capturedUrl = String(input);
				return new Response(null, { status: 204 });
			}),
		});

		await client.resetThread("thread/with slash");

		expect(capturedUrl).toBe(
			`${BASE_URL}/v1/threads/${encodeURIComponent("thread/with slash")}/reset`,
		);
	});

	test("complete asks one agent's model through /v1/chat/completions", async () => {
		let captured: { url: string; body: unknown } | undefined;
		const client = createHarnessClient({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch((input, init) => {
				captured = { url: String(input), body: JSON.parse(String(init?.body)) };
				return Response.json({
					choices: [{ message: { content: "Hello" } }],
					usage: { prompt_tokens: 3, completion_tokens: 1 },
				});
			}),
		});

		const answer = await client.complete("delta-function-call", "hi");

		expect(captured).toEqual({
			url: `${BASE_URL}/v1/chat/completions`,
			body: {
				model: "delta-function-call",
				messages: [{ role: "user", content: "hi" }],
			},
		});
		expect(answer).toEqual({ text: "Hello", inputTokens: 3, outputTokens: 1 });
	});

	test("decide posts the state and questions to /v1/decisions", async () => {
		let captured: { url: string; body: unknown } | undefined;
		const client = createHarnessClient({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch((input, init) => {
				captured = { url: String(input), body: JSON.parse(String(init?.body)) };
				return Response.json({
					answers: { q: { type: "boolean", value: true, probability: 0.9 } },
				});
			}),
		});
		const questions = { q: { type: "boolean", instructions: "Is it?" } };

		const answers = await client.decide("state", questions);

		expect(captured).toEqual({
			url: `${BASE_URL}/v1/decisions`,
			body: { state: "state", questions },
		});
		expect(answers).toEqual({
			q: { type: "boolean", value: true, probability: 0.9 },
		});
	});

	test("complete and decide throw on an error status", async () => {
		const client = createHarnessClient({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch(() => new Response("nope", { status: 502 })),
		});
		await expect(client.complete("beta-text", "hi")).rejects.toThrow("502");
		await expect(client.decide("s", {})).rejects.toThrow("502");
	});
});
