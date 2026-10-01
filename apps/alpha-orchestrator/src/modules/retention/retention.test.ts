import { describe, expect, test } from "bun:test";
import {
	llmCalls,
	threadWorldState,
	users,
} from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";
import {
	assertRetentionCoversHistory,
	deleteInactiveAnonymousUsers,
	deleteStaleWorldState,
	retentionCutoff,
} from "./retention.service.ts";

const HOUR = 60 * 60 * 1000;

describe("retentionCutoff", () => {
	test("is `hours` before now", () => {
		expect(retentionCutoff(100 * HOUR, 24)).toBe(76 * HOUR);
	});
});

describe("deleteInactiveAnonymousUsers", () => {
	test("deletes only anonymous users inactive longer than the retention; their usage rows survive unlinked", () => {
		const db = testDb();
		const now = 100 * HOUR;
		const anon = (id: string, lastSeenAt: number) =>
			db
				.insert(users)
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
		const identified = upsertIdentifiedUser(
			db,
			"ch_cli",
			"x",
			undefined,
			now - 50 * HOUR,
		);
		db.insert(llmCalls)
			.values({
				at: now - 30 * HOUR,
				userId: "stale",
				channelId: "ch_cli",
				kind: "generate",
				provider: "p",
				model: "m",
				inputTokens: 5,
				latencyMs: 1,
				ok: true,
			})
			.run();

		expect(deleteInactiveAnonymousUsers(db, now, 24)).toBe(1);
		expect(
			db
				.select({ id: users.id })
				.from(users)
				.all()
				.map((u) => u.id)
				.sort(),
		).toEqual(["fresh", identified.id].sort());
		expect(db.select().from(llmCalls).get()).toMatchObject({
			userId: null,
			channelId: "ch_cli",
			inputTokens: 5,
		});
	});
});

describe("deleteStaleWorldState", () => {
	test("deletes only WorldState checkpoints not updated within the retention window", () => {
		const db = testDb();
		const now = 100 * HOUR;
		const user = upsertIdentifiedUser(db, "ch_cli", "u1", undefined, 1);
		const stale = resolveThreadId(db, "ch_cli", user.id, "stale", 1);
		const fresh = resolveThreadId(db, "ch_cli", user.id, "fresh", 1);
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

test("passes when per-user retention covers the agent's history window", () => {
	expect(() => assertRetentionCoversHistory(10, 10)).not.toThrow();
});

test("throws when retention would drop messages the model still expects as context", () => {
	expect(() => assertRetentionCoversHistory(5, 10)).toThrow(
		/MESSAGE_RETENTION_PER_USER/,
	);
});
