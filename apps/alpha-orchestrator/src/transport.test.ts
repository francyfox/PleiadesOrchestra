import { describe, expect, test } from "bun:test";
import type {
	Agent,
	AgentStreamEvent,
	DecisionAgent,
	IncomingMessage,
} from "@repo/core";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client.ts";
import { SqliteHistoryStore } from "./db/history-store.ts";
import { ChannelDirectory } from "./db/identity.ts";
import { RunBinding } from "./db/run-binding.ts";
import { llmCalls, messages, planRuns, users } from "./db/schema.ts";
import { SqliteUsageRecorder } from "./db/usage-recorder.ts";
import { createApp } from "./server.ts";
import { testDb } from "./test/db.ts";

const API_KEY = "transport-key";

const decisionAgent: DecisionAgent = { decide: async () => ({}) };

/**
 * Stands in for `@repo/core`'s agent: writes history and usage through the
 * real SQLite adapters the way the core does, without an LLM.
 */
function persistingAgent(
	db: Db,
	runs: RunBinding,
	recorder: SqliteUsageRecorder,
) {
	const store = new SqliteHistoryStore(db, 10, runs);
	const calls: IncomingMessage[] = [];
	const agent: Agent = {
		async *handleMessageStream(message): AsyncGenerator<AgentStreamEvent> {
			calls.push(message);
			const ctx = { threadId: message.threadId, userId: message.userId };
			recorder.record({
				...ctx,
				kind: "generate",
				provider: "albedo",
				model: "m",
				inputTokens: 7,
				outputTokens: 3,
				latencyMs: 2,
				ok: true,
				at: Date.now(),
			});
			yield { type: "delta", text: "reply" };
			await store.append(ctx, [
				{ role: "user", content: message.chunks.join(" ") },
				{ role: "assistant", content: "reply" },
			]);
			yield { type: "done", elapsedMs: 1, inputTokens: 7, outputTokens: 3 };
		},
		resetThread: (threadId) => store.reset(threadId),
	};
	return { agent, calls };
}

function setup() {
	const db = testDb();
	const runs = new RunBinding();
	const recorder = new SqliteUsageRecorder(db, runs);
	const { agent, calls } = persistingAgent(db, runs, recorder);
	const app = createApp({
		agent,
		decisionAgent,
		apiKey: API_KEY,
		adminApiKey: "admin-key",
		maxChunkChars: 100,
		db,
		channels: new ChannelDirectory(db),
		runs,
		usageRecorder: recorder,
		ipHashSalt: "salt",
	});
	return { db, app, calls };
}

function post(path: string, body: unknown, key = API_KEY): Request {
	return new Request(`http://harness.local${path}`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${key}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

describe("POST /v1/access", () => {
	test("registers an unknown telegram user as pending (not allowed) and keeps their display name", async () => {
		const { app, db } = setup();
		const response = await app.handle(
			post("/v1/access", {
				channel: "telegram",
				externalUserId: "42",
				displayName: "Ivan",
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			allowed: boolean;
			userId: string;
		};
		expect(body.allowed).toBe(false);
		expect(
			db.select().from(users).where(eq(users.id, body.userId)).get(),
		).toMatchObject({
			externalUserId: "42",
			displayName: "Ivan",
			kind: "identified",
		});
	});

	test("allows a whitelisted user; repeated calls reuse the same user", async () => {
		const { app, db } = setup();
		const first = (await (
			await app.handle(
				post("/v1/access", { channel: "telegram", externalUserId: "42" }),
			)
		).json()) as { userId: string };
		db.update(users)
			.set({ whitelistedAt: 1 })
			.where(eq(users.id, first.userId))
			.run();

		const second = (await (
			await app.handle(
				post("/v1/access", { channel: "telegram", externalUserId: "42" }),
			)
		).json()) as { allowed: boolean; userId: string };
		expect(second).toEqual({ allowed: true, userId: first.userId });
	});

	test("unknown channel → 404", async () => {
		const { app } = setup();
		const response = await app.handle(
			post("/v1/access", { channel: "nope", externalUserId: "1" }),
		);
		expect(response.status).toBe(404);
	});

	test("the admin key does not open transport routes", async () => {
		const { app } = setup();
		const response = await app.handle(
			post("/v1/access", { channel: "cli", externalUserId: "1" }, "admin-key"),
		);
		expect(response.status).toBe(401);
	});
});

describe("POST /v1/messages access control", () => {
	test("a pending telegram user gets an empty 403 and the model is never called", async () => {
		const { app, calls } = setup();
		const response = await app.handle(
			post("/v1/messages", {
				channel: "telegram",
				threadId: "chat",
				userId: "42",
				text: "hi",
			}),
		);
		expect(response.status).toBe(403);
		expect(await response.text()).toBe("");
		expect(calls).toHaveLength(0);
	});

	test("a blocked user on an open channel gets 403", async () => {
		const { app, db, calls } = setup();
		await app.handle(
			post("/v1/access", { channel: "cli", externalUserId: "u" }),
		);
		db.update(users).set({ blockedAt: 1 }).run();
		const response = await app.handle(
			post("/v1/messages", { threadId: "t", userId: "u", text: "hi" }),
		);
		expect(response.status).toBe(403);
		expect(calls).toHaveLength(0);
	});

	test("unknown channel → 404", async () => {
		const { app } = setup();
		const response = await app.handle(
			post("/v1/messages", {
				channel: "nope",
				threadId: "t",
				userId: "u",
				text: "hi",
			}),
		);
		expect(response.status).toBe(404);
	});
});

describe("POST /v1/messages persistence", () => {
	test("links history and usage to a completed plan run", async () => {
		const { app, db, calls } = setup();
		const response = await app.handle(
			post("/v1/messages", { threadId: "t", userId: "u", text: "hello" }),
		);
		expect(response.status).toBe(200);
		await response.text();

		const run = db.select().from(planRuns).get();
		expect(run).toMatchObject({ succeeded: true, goal: { replied: true } });
		expect(run?.attempts).toBeGreaterThanOrEqual(1);
		const runId = run?.id as string;
		expect(calls[0]?.planRunId).toBe(runId);

		const stored = db.select().from(messages).all();
		expect(stored.map((m) => [m.role, m.content, m.planRunId])).toEqual([
			["user", "hello", runId],
			["assistant", "reply", runId],
		]);
		expect(db.select().from(llmCalls).get()).toMatchObject({
			planRunId: runId,
			channelId: "ch_cli",
			inputTokens: 7,
		});
	});

	test("history survives into the next message of the same thread", async () => {
		const { app, db } = setup();
		for (const text of ["one", "two"]) {
			await (
				await app.handle(
					post("/v1/messages", { threadId: "t", userId: "u", text }),
				)
			).text();
		}
		expect(db.select().from(messages).all()).toHaveLength(4);
		// Same user and thread reused, not re-created per message.
		expect(db.select().from(users).all()).toHaveLength(1);
	});
});
