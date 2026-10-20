import { describe, expect, test } from "bun:test";
import type { LlmCallRecord } from "@repo/core";
import { llmCalls } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
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
	test("buffers until flush, then writes every call with the visitor's channel", () => {
		const db = testDb();
		const visitor = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"42",
			undefined,
			1,
		);
		const thread = resolveThreadId(db, "ch_telegram", visitor.id, "chat", 1);
		const recorder = new SqliteUsageRecorder(db, new RunBinding());

		recorder.record(
			call({
				userId: visitor.id,
				threadId: thread,
				kind: "ingest",
				actionName: "generateReply",
			}),
		);
		recorder.record(call({ userId: visitor.id, threadId: thread }));
		expect(db.select().from(llmCalls).all()).toHaveLength(0);

		recorder.flush();
		const rows = db.select().from(llmCalls).all();
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			visitorId: visitor.id,
			channelId: "ch_telegram",
			threadId: thread,
			kind: "ingest",
			actionName: "generateReply",
		});
		recorder.flush();
		expect(db.select().from(llmCalls).all()).toHaveLength(2);
	});

	test("stores a decision's confidence, NULL when it has none", () => {
		const db = testDb();
		const recorder = new SqliteUsageRecorder(db, new RunBinding());
		recorder.record(call({ kind: "classify", confidence: 0.87 }));
		recorder.record(call({ kind: "generate" }));
		recorder.flush();
		const rows = db.select().from(llmCalls).all();
		expect(rows.map((row) => row.confidence)).toEqual([0.87, null]);
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

	test("references to unknown visitors/threads/runs are stored as NULL instead of failing the flush", () => {
		const db = testDb();
		const recorder = new SqliteUsageRecorder(db, new RunBinding());
		recorder.record(
			call({ userId: "nope", threadId: "nope", planRunId: "nope" }),
		);
		recorder.flush();
		expect(db.select().from(llmCalls).get()).toMatchObject({
			visitorId: null,
			channelId: null,
			threadId: null,
			planRunId: null,
		});
	});
});
