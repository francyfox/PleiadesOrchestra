import { describe, expect, test } from "bun:test";
import type {
	Agent,
	AgentStreamEvent,
	DecisionAgent,
	DecisionAnswer,
	DecisionQuestion,
	IncomingMessage,
} from "@repo/core";
import { ChannelDirectory } from "./db/identity.ts";
import { RunBinding } from "./db/run-binding.ts";
import { createApp, type ServerDeps } from "./server.ts";
import { testDb } from "./test/db.ts";

const API_KEY = "test-api-key";
const MAX_CHUNK_CHARS = 20;

function createTestApp(
	overrides: Partial<ServerDeps> & Pick<ServerDeps, "agent" | "decisionAgent">,
) {
	const db = overrides.db ?? testDb();
	return createApp({
		apiKey: API_KEY,
		adminApiKey: "test-admin-key",
		maxChunkChars: MAX_CHUNK_CHARS,
		db,
		channels: new ChannelDirectory(db),
		runs: new RunBinding(),
		ipHashSalt: "salt",
		...overrides,
	});
}

function fakeAgent(
	handleMessageStream: Agent["handleMessageStream"],
	resetThread: Agent["resetThread"] = async () => {},
): Agent {
	return { handleMessageStream, resetThread };
}

function fakeDecisionAgent(
	decide: DecisionAgent["decide"] = async () => ({}),
): DecisionAgent {
	return { decide };
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
	yield { type: "done", elapsedMs: 3, inputTokens: 10, outputTokens: 2 };
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

describe("createApp", () => {
	test("GET /health responds ok without auth", async () => {
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			new Request("http://harness.local/health"),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("GET /swagger/json is reachable without auth", async () => {
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			new Request("http://harness.local/swagger/json"),
		);

		expect(response.status).toBe(200);
	});

	test("rejects requests without a valid bearer token", async () => {
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			new Request("http://harness.local/v1/messages", { method: "POST" }),
		);

		expect(response.status).toBe(401);
	});

	test("POST /v1/messages normalizes text and streams NDJSON events from the agent", async () => {
		let receivedMessage: IncomingMessage | undefined;
		const app = createTestApp({
			agent: fakeAgent(async function* (message) {
				receivedMessage = message;
				yield* singleDeltaStream(message);
			}),
			decisionAgent: fakeDecisionAgent(),
		});

		const response = await app.handle(
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
		// threadId/userId are now the orchestrator's internal ids (the external
		// "t1"/"u1" are mapped via the threads/users tables).
		expect(receivedMessage).toMatchObject({ chunks: ["hi there"] });
		expect(receivedMessage?.userId).not.toBe("u1");
		expect(receivedMessage?.threadId).not.toBe("t1");

		const events = await readNdjson(response);
		// No `progress` event: that was specific to the old multi-chunk ingest
		// pipeline, not to what the planner's single `generateReply` action
		// does — see the GOAP plan doc's Phase 5 notes. `delta` still streams
		// live (via the action's `onDelta`), and `done` still carries the
		// underlying agent call's own token counts (via world-state facts).
		expect(events).toEqual([
			{ type: "delta", text: "echo: hi there" },
			{ type: "done", elapsedMs: 3, inputTokens: 10, outputTokens: 2 },
		]);
	});

	test("POST /v1/messages splits long text into multiple chunks", async () => {
		let receivedMessage: IncomingMessage | undefined;
		const app = createTestApp({
			agent: fakeAgent(async function* (message) {
				receivedMessage = message;
				yield { type: "done", elapsedMs: 3 };
			}),
			decisionAgent: fakeDecisionAgent(),
		});

		const longText =
			"this message is deliberately longer than the configured chunk budget so it must be split";

		await app.handle(
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
		const app = createTestApp({
			agent: fakeAgent(async function* () {
				yield { type: "delta", text: "partial" } as const;
				throw new Error("boom");
			}),
			decisionAgent: fakeDecisionAgent(),
		});

		const response = await app.handle(
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
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ threadId: "t1" }),
			}),
		);

		// Elysia's own schema-validation error (422, not a hand-rolled 400) —
		// no consumer branches on the exact code, just `response.ok`.
		expect(response.status).toBe(422);
	});

	test("POST /v1/messages rejects unparseable JSON", async () => {
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "not json",
			}),
		);

		expect(response.status).toBe(400);
	});

	async function sendMessage(
		app: ReturnType<typeof createTestApp>,
		body: Record<string, unknown>,
	) {
		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		);
		await response.text();
		return response;
	}

	test("POST /v1/threads/:id/reset resets the internal thread behind the external id and returns 204", async () => {
		let messageThreadId: string | undefined;
		const resetThreadIds: string[] = [];
		const app = createTestApp({
			agent: fakeAgent(
				async function* (message) {
					messageThreadId = message.threadId;
					yield* singleDeltaStream(message);
				},
				async (threadId) => {
					resetThreadIds.push(threadId);
				},
			),
			decisionAgent: fakeDecisionAgent(),
		});
		await sendMessage(app, { threadId: "t1", userId: "u1", text: "hi" });

		const response = await app.handle(
			authedRequest("http://harness.local/v1/threads/t1/reset", {
				method: "POST",
			}),
		);

		expect(response.status).toBe(204);
		expect(resetThreadIds).toEqual([messageThreadId as string]);
	});

	test("POST /v1/threads/:id/reset decodes a URL-encoded thread id", async () => {
		const resetThreadIds: string[] = [];
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream, async (threadId) => {
				resetThreadIds.push(threadId);
			}),
			decisionAgent: fakeDecisionAgent(),
		});
		await sendMessage(app, {
			threadId: "thread/with slash",
			userId: "u1",
			text: "hi",
		});

		const encoded = encodeURIComponent("thread/with slash");
		const response = await app.handle(
			authedRequest(`http://harness.local/v1/threads/${encoded}/reset`, {
				method: "POST",
			}),
		);

		expect(response.status).toBe(204);
		expect(resetThreadIds).toHaveLength(1);
	});

	test("POST /v1/threads/:id/reset for an unknown thread is a no-op 204", async () => {
		const resetThreadIds: string[] = [];
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream, async (threadId) => {
				resetThreadIds.push(threadId);
			}),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			authedRequest("http://harness.local/v1/threads/nope/reset", {
				method: "POST",
			}),
		);
		expect(response.status).toBe(204);
		expect(resetThreadIds).toEqual([]);
	});

	test("rejects /v1/decisions requests without a valid bearer token", async () => {
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			new Request("http://harness.local/v1/decisions", { method: "POST" }),
		);

		expect(response.status).toBe(401);
	});

	test("POST /v1/decisions forwards state and questions to decisionAgent.decide and returns its answers", async () => {
		let receivedState: unknown;
		let receivedQuestions: Record<string, DecisionQuestion> | undefined;

		const answers: Record<string, DecisionAnswer> = {
			urgent: { type: "noul", noul: 0.42, rl_agent: { act_probability: 1 } },
		};

		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(async (state, questions) => {
				receivedState = state;
				receivedQuestions = questions;
				return answers;
			}),
		});

		const response = await app.handle(
			authedRequest("http://harness.local/v1/decisions", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					state: { ticket: "refund request" },
					questions: {
						urgent: { type: "noul", instructions: "Is this urgent?" },
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ answers });
		expect(receivedState).toEqual({ ticket: "refund request" });
		expect(receivedQuestions).toEqual({
			urgent: { type: "noul", instructions: "Is this urgent?" },
		});
	});

	test("POST /v1/decisions rejects a malformed body", async () => {
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			authedRequest("http://harness.local/v1/decisions", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ state: {} }),
			}),
		);

		expect(response.status).toBe(422);
	});

	test("unknown routes return 404", async () => {
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			authedRequest("http://harness.local/nope"),
		);

		expect(response.status).toBe(404);
	});
});
