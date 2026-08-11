import { describe, expect, test } from "bun:test";
import type { Agent, AgentStreamEvent, IncomingMessage } from "@repo/core";
import { createFetchHandler } from "./server.ts";

const API_KEY = "test-api-key";
const MAX_CHUNK_CHARS = 20;

function fakeAgent(
	handleMessageStream: Agent["handleMessageStream"],
	resetThread: Agent["resetThread"] = () => {},
): Agent {
	return { handleMessageStream, resetThread };
}

async function* singleDeltaStream(
	message: IncomingMessage,
): AsyncGenerator<AgentStreamEvent> {
	yield {
		type: "progress",
		chunkIndex: 0,
		totalChunks: message.chunks.length,
		elapsedMs: 1,
		contextChars: message.chunks[0]?.length ?? 0,
	};
	yield { type: "delta", text: `echo: ${message.chunks[0] ?? ""}` };
	yield { type: "done" };
}

function authedRequest(url: string, init: RequestInit = {}): Request {
	return new Request(url, {
		...init,
		headers: { ...init.headers, authorization: `Bearer ${API_KEY}` },
	});
}

async function readNdjson(response: Response): Promise<unknown[]> {
	const text = await response.text();
	return text
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line));
}

describe("createFetchHandler", () => {
	test("GET /health responds ok without auth", async () => {
		const handler = createFetchHandler({
			agent: fakeAgent(singleDeltaStream),
			apiKey: API_KEY,
			maxChunkChars: MAX_CHUNK_CHARS,
		});
		const response = await handler(new Request("http://harness.local/health"));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("rejects requests without a valid bearer token", async () => {
		const handler = createFetchHandler({
			agent: fakeAgent(singleDeltaStream),
			apiKey: API_KEY,
			maxChunkChars: MAX_CHUNK_CHARS,
		});
		const response = await handler(
			new Request("http://harness.local/v1/messages", { method: "POST" }),
		);

		expect(response.status).toBe(401);
	});

	test("POST /v1/messages normalizes text and streams NDJSON events from the agent", async () => {
		let receivedMessage: IncomingMessage | undefined;
		const handler = createFetchHandler({
			agent: fakeAgent(async function* (message) {
				receivedMessage = message;
				yield* singleDeltaStream(message);
			}),
			apiKey: API_KEY,
			maxChunkChars: MAX_CHUNK_CHARS,
		});

		const response = await handler(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					threadId: "t1",
					userId: "u1",
					text: "  hi   there  ",
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/x-ndjson");
		expect(receivedMessage).toEqual({
			threadId: "t1",
			userId: "u1",
			chunks: ["hi there"],
		});

		const events = await readNdjson(response);
		expect(events).toEqual([
			{ type: "progress", chunkIndex: 0, totalChunks: 1, elapsedMs: 1, contextChars: 8 },
			{ type: "delta", text: "echo: hi there" },
			{ type: "done" },
		]);
	});

	test("POST /v1/messages splits long text into multiple chunks", async () => {
		let receivedMessage: IncomingMessage | undefined;
		const handler = createFetchHandler({
			agent: fakeAgent(async function* (message) {
				receivedMessage = message;
				yield { type: "done" };
			}),
			apiKey: API_KEY,
			maxChunkChars: MAX_CHUNK_CHARS,
		});

		const longText =
			"this message is deliberately longer than the configured chunk budget so it must be split";

		await handler(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ threadId: "t1", userId: "u1", text: longText }),
			}),
		);

		expect(receivedMessage?.chunks.length).toBeGreaterThan(1);
		for (const chunk of receivedMessage?.chunks ?? []) {
			expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
		}
		expect(receivedMessage?.chunks.join(" ")).toBe(longText);
	});

	test("POST /v1/messages emits a trailing error event when the agent throws mid-stream", async () => {
		const handler = createFetchHandler({
			agent: fakeAgent(async function* () {
				yield { type: "delta", text: "partial" } as const;
				throw new Error("boom");
			}),
			apiKey: API_KEY,
			maxChunkChars: MAX_CHUNK_CHARS,
		});

		const response = await handler(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ threadId: "t1", userId: "u1", text: "hi" }),
			}),
		);

		expect(response.status).toBe(200);
		const events = await readNdjson(response);
		expect(events).toEqual([
			{ type: "delta", text: "partial" },
			{ type: "error", message: "boom" },
		]);
	});

	test("POST /v1/messages rejects a malformed body", async () => {
		const handler = createFetchHandler({
			agent: fakeAgent(singleDeltaStream),
			apiKey: API_KEY,
			maxChunkChars: MAX_CHUNK_CHARS,
		});
		const response = await handler(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ threadId: "t1" }),
			}),
		);

		expect(response.status).toBe(400);
	});

	test("POST /v1/threads/:id/reset resets the thread and returns 204", async () => {
		let resetThreadId: string | undefined;
		const handler = createFetchHandler({
			agent: fakeAgent(singleDeltaStream, (threadId) => {
				resetThreadId = threadId;
			}),
			apiKey: API_KEY,
			maxChunkChars: MAX_CHUNK_CHARS,
		});

		const response = await handler(
			authedRequest("http://harness.local/v1/threads/t1/reset", {
				method: "POST",
			}),
		);

		expect(response.status).toBe(204);
		expect(resetThreadId).toBe("t1");
	});

	test("unknown routes return 404", async () => {
		const handler = createFetchHandler({
			agent: fakeAgent(singleDeltaStream),
			apiKey: API_KEY,
			maxChunkChars: MAX_CHUNK_CHARS,
		});
		const response = await handler(authedRequest("http://harness.local/nope"));

		expect(response.status).toBe(404);
	});
});
