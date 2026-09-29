import { describe, expect, test } from "bun:test";
import type {
	Agent,
	AgentStreamEvent,
	DecisionAgent,
	DecisionAnswer,
	DecisionQuestion,
	GoapAction,
	IncomingMessage,
} from "@repo/core";
import { InMemoryWorldStateStore } from "@repo/core";
import {
	ChannelDirectory,
	resolveThreadId,
	upsertIdentifiedUser,
} from "./db/identity.ts";
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
		// No accept-encoding sent above — the stream must stay uncompressed.
		expect(response.headers.get("content-encoding")).toBeNull();
	});

	test("POST /v1/messages gzips the NDJSON stream when the client accepts gzip", async () => {
		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});

		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"accept-encoding": "gzip, deflate, br",
				},
				body: JSON.stringify({ threadId: "t1", userId: "u1", text: "hi" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-encoding")).toBe("gzip");
		expect(response.body).not.toBeNull();

		const gunzip = new DecompressionStream(
			"gzip",
		) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
		const text = await new Response(
			(response.body as ReadableStream<Uint8Array>).pipeThrough(gunzip),
		).text();
		const events = text
			.split("\n")
			.filter((line) => line.length > 0)
			.map((line) => JSON.parse(line));
		expect(events).toEqual([
			{ type: "delta", text: "echo: hi" },
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

function deferred<T = void>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

/** Same upserts `/v1/messages` does internally — idempotent, so calling them ahead of a request just resolves the id it will use. */
function internalThreadId(db: ServerDeps["db"], externalThreadId = "t1") {
	const channels = new ChannelDirectory(db);
	const channel = channels.bySlug("cli");
	if (!channel) throw new Error("cli channel not seeded");
	const user = upsertIdentifiedUser(
		db,
		channel.id,
		"u1",
		undefined,
		Date.now(),
	);
	return resolveThreadId(db, channel.id, user.id, externalThreadId, Date.now());
}

describe("createApp — GOAP process lifecycle", () => {
	test("clears the persisted WorldState once a run succeeds", async () => {
		const db = testDb();
		const store = new InMemoryWorldStateStore();
		const threadId = internalThreadId(db);
		await store.save(threadId, { stale: true });

		const app = createTestApp({
			db,
			worldStateStore: store,
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ threadId: "t1", userId: "u1", text: "hi" }),
			}),
		);
		await readNdjson(response);

		expect(await store.load(threadId)).toBeUndefined();
	});

	test("saves the WorldState when a run is killed by an already-aborted signal, instead of running any action", async () => {
		const db = testDb();
		const store = new InMemoryWorldStateStore();
		const threadId = internalThreadId(db);
		let agentCalled = false;

		const app = createTestApp({
			db,
			worldStateStore: store,
			agent: fakeAgent(async function* (message) {
				agentCalled = true;
				yield* singleDeltaStream(message);
			}),
			decisionAgent: fakeDecisionAgent(),
		});

		const controller = new AbortController();
		controller.abort();
		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ threadId: "t1", userId: "u1", text: "hi" }),
				signal: controller.signal,
			}),
		);
		const events = await readNdjson(response);

		expect(agentCalled).toBe(false);
		expect(events).toEqual([{ type: "error", message: "run cancelled" }]);
		expect(await store.load(threadId)).toMatchObject({
			userMessage: "hi",
			threadId,
		});
	});

	test("resumes from persisted WorldState, and the current turn's own facts win over stale ones", async () => {
		const db = testDb();
		const store = new InMemoryWorldStateStore();
		const threadId = internalThreadId(db);
		await store.save(threadId, { userMessage: "stale", budget: 500 });

		let seenBudget: unknown;
		let seenUserMessage: unknown;
		const cheapReply: GoapAction = {
			name: "cheapReply",
			// Cheaper than the static `generateReply` (cost 5) — the planner
			// picks this one, so its `execute()` observes the merged state.
			cost: 0,
			preconditions: {},
			effects: { replied: true },
			async execute(ctx) {
				seenBudget = ctx.state.budget;
				seenUserMessage = ctx.state.userMessage;
				return { replied: true };
			},
		};

		const app = createTestApp({
			db,
			worldStateStore: store,
			threadActionsFor: () => [cheapReply],
			agent: fakeAgent(singleDeltaStream),
			decisionAgent: fakeDecisionAgent(),
		});
		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					threadId: "t1",
					userId: "u1",
					text: "new message",
				}),
			}),
		);
		await readNdjson(response);

		expect(seenBudget).toBe(500);
		expect(seenUserMessage).toBe("new message");
	});

	test("serializes two requests on the same thread through runLock, and leaves a different thread unaffected", async () => {
		const order: string[] = [];
		const gate = deferred();
		let calls = 0;

		const agent = fakeAgent(async function* () {
			calls++;
			const call = calls;
			if (call === 1) {
				// The first call to actually run (thread "t1"'s first request) —
				// gated so the test can observe what does/doesn't run while it waits.
				order.push("a-start");
				await gate.promise;
				order.push("a-end");
			} else {
				order.push(`run-${call}`);
			}
			yield { type: "done", elapsedMs: 1 } as const;
		});
		const app = createTestApp({ agent, decisionAgent: fakeDecisionAgent() });

		const requestFor = (threadId: string) =>
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ threadId, userId: "u1", text: "hi" }),
			});

		// Same thread as the in-flight first call — must queue behind it.
		const sameThreadA = app.handle(requestFor("t1"));
		await new Promise((resolve) => setTimeout(resolve, 10));
		const sameThreadB = app.handle(requestFor("t1"));
		// Different thread — must run without waiting on "t1"'s lock.
		const otherThread = app.handle(requestFor("t2"));

		await readNdjson(await otherThread);
		expect(order).toContain("run-2");
		expect(order).not.toContain("a-end");

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(order).toEqual(["a-start", "run-2"]);

		gate.resolve();
		await readNdjson(await sameThreadA);
		await readNdjson(await sameThreadB);

		expect(order).toEqual(["a-start", "run-2", "a-end", "run-3"]);
	});
});

describe("createApp — message intent routing", () => {
	function choiceAnswer(choice: string): DecisionAnswer {
		return {
			type: "choice",
			choice,
			probabilities: { [choice]: 1 },
			confidence: 1,
			rl_agent: { act_probability: 1 },
		};
	}

	test("skips Laya classification (and the plain reply wins) when no thread actions are bound", async () => {
		let decideCalls = 0;
		const decisionAgent = fakeDecisionAgent(async () => {
			decideCalls++;
			return {};
		});

		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent,
		});
		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ threadId: "t1", userId: "u1", text: "привет" }),
			}),
		);
		const events = await readNdjson(response);

		expect(decideCalls).toBe(0);
		expect(
			events.some((event) => (event as { type: string }).type === "done"),
		).toBe(true);
	});

	test("classifies a task message and extends the goal so plan() chains in the matching thread action", async () => {
		let cartActionRan = false;
		let seenMessageIntent: unknown;
		const cartAction: GoapAction = {
			name: "cartTool",
			cost: 2,
			preconditions: {},
			effects: { inCart: true },
			async execute(ctx) {
				cartActionRan = true;
				seenMessageIntent = ctx.state.messageIntent;
				return { inCart: true };
			},
		};
		const decisionAgent = fakeDecisionAgent(async () => ({
			intent: choiceAnswer("addToCart"),
		}));

		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent,
			threadActionsFor: () => [cartAction],
		});
		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					threadId: "t1",
					userId: "u1",
					text: "добавь самый дешёвый ноутбук в корзину",
				}),
			}),
		);
		const events = await readNdjson(response);

		expect(cartActionRan).toBe(true);
		expect(seenMessageIntent).toBe("addToCart");
		expect(
			events.some((event) => (event as { type: string }).type === "done"),
		).toBe(true);
	});

	test("a classified task intent with no matching action in the catalog degrades to a plain reply instead of failing", async () => {
		let unrelatedActionRan = false;
		const unrelatedAction: GoapAction = {
			name: "searchTool",
			cost: 2,
			preconditions: {},
			effects: { catalogSearched: true },
			async execute() {
				unrelatedActionRan = true;
				return { catalogSearched: true };
			},
		};
		// Classified as "checkout" (needs `checkoutComplete`), but nothing in
		// the catalog produces that fact — `goalForIntent` must fall back to
		// the base `{ replied: true }` goal instead of handing `plan()` a fact
		// nothing can supply.
		const decisionAgent = fakeDecisionAgent(async () => ({
			intent: choiceAnswer("checkout"),
		}));

		const app = createTestApp({
			agent: fakeAgent(singleDeltaStream),
			decisionAgent,
			threadActionsFor: () => [unrelatedAction],
		});
		const response = await app.handle(
			authedRequest("http://harness.local/v1/messages", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					threadId: "t1",
					userId: "u1",
					text: "оформи заказ",
				}),
			}),
		);
		const events = await readNdjson(response);

		expect(unrelatedActionRan).toBe(false);
		expect(
			events.some((event) => (event as { type: string }).type === "done"),
		).toBe(true);
	});
});
