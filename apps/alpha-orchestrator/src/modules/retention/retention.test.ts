import { describe, expect, test } from "bun:test";
import {
	llmCalls,
	threadWorldState,
	visitors,
} from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
import {
	assertRetentionCoversHistory,
	deleteInactiveAnonymousVisitors,
	deleteStaleWorldState,
	retentionCutoff,
} from "./retention.service.ts";

const HOUR = 60 * 60 * 1000;

describe("retentionCutoff", () => {
	test("is `hours` before now", () => {
		expect(retentionCutoff(100 * HOUR, 24)).toBe(76 * HOUR);
	});
});

describe("deleteInactiveAnonymousVisitors", () => {
	test("deletes only anonymous visitors inactive longer than the retention; their usage rows survive unlinked and without the visitor's text", () => {
		const db = testDb();
		const now = 100 * HOUR;
		const anon = (id: string, lastSeenAt: number) =>
			db
				.insert(visitors)
				.values({
					id,
					channelId: "ch_cli",
					kind: "anonymous",
					createdAt: lastSeenAt,
					lastSeenAt,
				})
				.run();
		anon("stale", now - 25 * HOUR);
		anon("fresh", now - 1 * HOUR);
		const identified = upsertIdentifiedVisitor(
			db,
			"ch_cli",
			"x",
			undefined,
			now - 50 * HOUR,
		);
		db.insert(llmCalls)
			.values({
				at: now - 30 * HOUR,
				visitorId: "stale",
				channelId: "ch_cli",
				kind: "generate",
				provider: "p",
				model: "m",
				inputTokens: 5,
				latencyMs: 1,
				ok: true,
				prompt: '[{"role":"user","content":"my address is …"}]',
				response: "ok",
				choices: [
					{ question: "q", chosen: "a", options: { a: 1 }, state: { m: "…" } },
				],
			})
			.run();

		expect(deleteInactiveAnonymousVisitors(db, now, 24)).toBe(1);
		expect(
			db
				.select({ id: visitors.id })
				.from(visitors)
				.all()
				.map((u) => u.id)
				.sort(),
		).toEqual(["fresh", identified.id].sort());
		expect(db.select().from(llmCalls).get()).toMatchObject({
			visitorId: null,
			channelId: "ch_cli",
			inputTokens: 5,
			prompt: null,
			response: null,
			choices: null,
		});
	});
});

describe("deleteStaleWorldState", () => {
	test("deletes only WorldState checkpoints not updated within the retention window", () => {
		const db = testDb();
		const now = 100 * HOUR;
		const visitor = upsertIdentifiedVisitor(db, "ch_cli", "u1", undefined, 1);
		const stale = resolveThreadId(db, "ch_cli", visitor.id, "stale", 1);
		const fresh = resolveThreadId(db, "ch_cli", visitor.id, "fresh", 1);
		db.insert(threadWorldState)
			.values({
				threadId: stale,
				state: { step: "checkout" },
				goal: { replied: true },
				updatedAt: now - 25 * HOUR,
			})
			.run();
		db.insert(threadWorldState)
			.values({
				threadId: fresh,
				state: { step: "search" },
				goal: { replied: true },
				updatedAt: now - 1 * HOUR,
			})
			.run();

		expect(deleteStaleWorldState(db, now, 24)).toBe(1);
		expect(
			db
				.select({ threadId: threadWorldState.threadId })
				.from(threadWorldState)
				.all()
				.map((row) => row.threadId),
		).toEqual([fresh]);
	});
});

test("passes when per-visitor retention covers the agent's history window", () => {
	expect(() => assertRetentionCoversHistory(10, 10)).not.toThrow();
});

test("throws when retention would drop messages the model still expects as context", () => {
	expect(() => assertRetentionCoversHistory(5, 10)).toThrow(
		/MESSAGE_RETENTION_PER_USER/,
	);
});
