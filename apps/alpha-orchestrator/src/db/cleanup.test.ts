import { describe, expect, test } from "bun:test";
import { testDb } from "../test/db.ts";
import { anonymousCutoff, deleteInactiveAnonymousUsers } from "./cleanup.ts";
import { upsertIdentifiedUser } from "./identity.ts";
import { llmCalls, users } from "./schema.ts";

const HOUR = 60 * 60 * 1000;

describe("anonymousCutoff", () => {
	test("is `hours` before now", () => {
		expect(anonymousCutoff(100 * HOUR, 24)).toBe(76 * HOUR);
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
