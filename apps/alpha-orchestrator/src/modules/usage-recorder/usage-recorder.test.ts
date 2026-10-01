import { describe, expect, test } from "bun:test";
import type { LlmCallRecord } from "@repo/core";
import { llmCalls } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";
import { SqliteUsageRecorder } from "./usage-recorder.ts";

function call(overrides: Partial<LlmCallRecord>): LlmCallRecord {
	return {
		threadId: "t",
		userId: "u",
		kind: "generate",
		provider: "albedo",
		model: "m",
		inputTokens: 10,
		outputTokens: 2,
		latencyMs: 5,
		ok: true,
		at: 1000,
		...overrides,
	};
}

describe("SqliteUsageRecorder", () => {
	test("buffers until flush, then writes every call with the user's channel", () => {
		const db = testDb();
		const user = upsertIdentifiedUser(db, "ch_telegram", "42", undefined, 1);
		const thread = resolveThreadId(db, "ch_telegram", user.id, "chat", 1);
		const recorder = new SqliteUsageRecorder(db, new RunBinding());

		recorder.record(
			call({
				userId: user.id,
				threadId: thread,
				kind: "ingest",
				actionName: "generateReply",
			}),
		);
		recorder.record(call({ userId: user.id, threadId: thread }));
		expect(db.select().from(llmCalls).all()).toHaveLength(0);

		recorder.flush();
		const rows = db.select().from(llmCalls).all();
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			userId: user.id,
			channelId: "ch_telegram",
			threadId: thread,
			kind: "ingest",
			actionName: "generateReply",
		});
		recorder.flush();
		expect(db.select().from(llmCalls).all()).toHaveLength(2);
	});

	test("keeps missing usage as NULL, never 0", () => {
		const db = testDb();
		const recorder = new SqliteUsageRecorder(db, new RunBinding());
		recorder.record(call({ inputTokens: undefined, outputTokens: undefined }));
		recorder.flush();
		expect(db.select().from(llmCalls).get()).toMatchObject({
			inputTokens: null,
			outputTokens: null,
		});
	});

	test("references to unknown users/threads/runs are stored as NULL instead of failing the flush", () => {
		const db = testDb();
		const recorder = new SqliteUsageRecorder(db, new RunBinding());
		recorder.record(
			call({ userId: "nope", threadId: "nope", planRunId: "nope" }),
		);
		recorder.flush();
		expect(db.select().from(llmCalls).get()).toMatchObject({
			userId: null,
			channelId: null,
			threadId: null,
			planRunId: null,
		});
	});
});
