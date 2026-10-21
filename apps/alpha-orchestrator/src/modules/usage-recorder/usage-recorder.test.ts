import { describe, expect, test } from "bun:test";
import type { LlmCallRecord } from "@repo/core";
import { creditLedger, llmCalls } from "../database/database.schema.ts";
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

describe("SqliteUsageRecorder debit", () => {
	const prices = () =>
		new Map([["paid/model", { input: 0.000001, output: 0.000002 }]]);
	function setup() {
		const db = testDb();
		const owner = db.$client.query(
			"UPDATE channels SET owner_id = 'acc_1' WHERE id = 'ch_telegram'",
		);
		owner.run();
		const visitor = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"42",
			undefined,
			1,
		);
		const recorder = new SqliteUsageRecorder(db, new RunBinding(), { prices });
		return { db, visitor, recorder };
	}

	test("a paid call debits its owner by tokens x price, in micro-USD, referencing the call", () => {
		const { db, visitor, recorder } = setup();
		recorder.record(
			call({
				userId: visitor.id,
				model: "paid/model",
				inputTokens: 1000,
				outputTokens: 500,
			}),
		);
		recorder.flush();
		const call1 = db.select().from(llmCalls).get();
		expect(db.select().from(creditLedger).all()).toEqual([
			expect.objectContaining({
				accountId: "acc_1",
				amount: -2000,
				reason: "usage",
				ref: String(call1?.id),
			}),
		]);
	});

	test("local, unpriced, usage-less and staff-owned calls debit nothing", () => {
		const { db, visitor, recorder } = setup();
		recorder.record(call({ userId: visitor.id, model: "local" }));
		recorder.record(
			call({
				userId: visitor.id,
				model: "paid/model",
				inputTokens: undefined,
				outputTokens: undefined,
			}),
		);
		const staff = upsertIdentifiedVisitor(db, "ch_cli", "7", undefined, 1);
		recorder.record(call({ userId: staff.id, model: "paid/model" }));
		recorder.flush();
		expect(db.select().from(llmCalls).all()).toHaveLength(3);
		expect(db.select().from(creditLedger).all()).toEqual([]);
	});

	test("a failing debit is logged and the call row is still stored", () => {
		const { db, visitor } = setup();
		db.$client.run(
			"CREATE TRIGGER boom BEFORE INSERT ON credit_ledger BEGIN SELECT RAISE(ABORT, 'boom'); END",
		);
		const logged: string[] = [];
		const recorder = new SqliteUsageRecorder(db, new RunBinding(), {
			prices,
			log: (m) => logged.push(m),
		});
		recorder.record(call({ userId: visitor.id, model: "paid/model" }));
		recorder.flush();
		expect(db.select().from(llmCalls).all()).toHaveLength(1);
		expect(logged).toHaveLength(1);
	});

	test("onDebited fires once per debited account per flush", () => {
		const { db, visitor } = setup();
		const debited: string[] = [];
		const recorder = new SqliteUsageRecorder(db, new RunBinding(), {
			prices,
			onDebited: (id) => debited.push(id),
		});
		recorder.record(call({ userId: visitor.id, model: "paid/model" }));
		recorder.record(call({ userId: visitor.id, model: "paid/model" }));
		recorder.record(call({ userId: visitor.id, model: "local" }));
		recorder.flush();
		expect(debited).toEqual(["acc_1"]);
	});
});
