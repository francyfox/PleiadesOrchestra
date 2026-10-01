import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { messages, planRuns } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";
import { SqliteHistoryStore } from "./history.ts";

function setup(retention = 10) {
	const db = testDb();
	const user = upsertIdentifiedUser(db, "ch_cli", "u1", undefined, 1);
	const threadA = resolveThreadId(db, "ch_cli", user.id, "a", 1);
	const threadB = resolveThreadId(db, "ch_cli", user.id, "b", 1);
	const runs = new RunBinding();
	const store = new SqliteHistoryStore(db, retention, runs, () => 100);
	return { db, user, threadA, threadB, runs, store };
}

describe("SqliteHistoryStore", () => {
	test("returns the thread's most recent messages, oldest first, capped by limit", async () => {
		const { user, threadA, store } = setup();
		for (let i = 0; i < 3; i++) {
			await store.append({ threadId: threadA, userId: user.id }, [
				{ role: "user", content: `q${i}` },
				{ role: "assistant", content: `a${i}` },
			]);
		}
		expect(await store.get(threadA, 3)).toEqual([
			{ role: "assistant", content: "a1" },
			{ role: "user", content: "q2" },
			{ role: "assistant", content: "a2" },
		]);
	});

	test("keeps only the last N messages per user, across all of the user's threads", async () => {
		const { db, user, threadA, threadB, store } = setup(4);
		await store.append({ threadId: threadA, userId: user.id }, [
			{ role: "user", content: "a-q" },
			{ role: "assistant", content: "a-a" },
		]);
		await store.append({ threadId: threadB, userId: user.id }, [
			{ role: "user", content: "b-q1" },
			{ role: "assistant", content: "b-a1" },
			{ role: "user", content: "b-q2" },
			{ role: "assistant", content: "b-a2" },
		]);
		// Per-user retention: activity in thread b evicts thread a's context.
		expect(await store.get(threadA, 10)).toEqual([]);
		expect(db.select().from(messages).all()).toHaveLength(4);
	});

	test("reset deletes only that thread's messages", async () => {
		const { user, threadA, threadB, store } = setup();
		await store.append({ threadId: threadA, userId: user.id }, [
			{ role: "user", content: "a" },
		]);
		await store.append({ threadId: threadB, userId: user.id }, [
			{ role: "user", content: "b" },
		]);
		await store.reset(threadA);
		expect(await store.get(threadA, 10)).toEqual([]);
		expect(await store.get(threadB, 10)).toHaveLength(1);
	});

	test("links messages to the plan run bound to the thread when ctx has none", async () => {
		const { db, user, threadA, runs, store } = setup();
		db.insert(planRuns)
			.values({
				id: "run1",
				userId: user.id,
				threadId: threadA,
				goal: {},
				succeeded: false,
				attempts: 0,
				durationMs: 0,
				createdAt: 50,
			})
			.run();
		runs.bind(threadA, "run1");
		await store.append({ threadId: threadA, userId: user.id }, [
			{ role: "user", content: "q" },
		]);
		expect(
			db.select().from(messages).where(eq(messages.threadId, threadA)).get()
				?.planRunId,
		).toBe("run1");
	});

	test("deletes plan runs whose messages were all evicted by retention", async () => {
		const { db, user, threadA, store } = setup(2);
		db.insert(planRuns)
			.values({
				id: "old",
				userId: user.id,
				threadId: threadA,
				goal: {},
				succeeded: true,
				attempts: 1,
				durationMs: 1,
				createdAt: 10,
			})
			.run();
		await store.append(
			{ threadId: threadA, userId: user.id, planRunId: "old" },
			[
				{ role: "user", content: "q1" },
				{ role: "assistant", content: "a1" },
			],
		);
		await store.append({ threadId: threadA, userId: user.id }, [
			{ role: "user", content: "q2" },
			{ role: "assistant", content: "a2" },
		]);
		expect(db.select().from(planRuns).all()).toEqual([]);
	});

	test("keeps a user's still-running plan runs when another run's messages trigger trimming", async () => {
		// Several messages from one user processed at once (e.g. Telegram
		// redelivering a backlog): every run row exists before any of them
		// appends messages. The first append must not delete the others.
		const { db, user, threadA, store } = setup();
		for (const id of ["first", "second"]) {
			db.insert(planRuns)
				.values({
					id,
					userId: user.id,
					threadId: threadA,
					goal: {},
					succeeded: false,
					attempts: 0,
					durationMs: 0,
					createdAt: 50,
				})
				.run();
		}
		await store.append(
			{ threadId: threadA, userId: user.id, planRunId: "first" },
			[
				{ role: "user", content: "q1" },
				{ role: "assistant", content: "a1" },
			],
		);

		await store.append(
			{ threadId: threadA, userId: user.id, planRunId: "second" },
			[
				{ role: "user", content: "q2" },
				{ role: "assistant", content: "a2" },
			],
		);

		expect(
			db
				.select({ id: planRuns.id })
				.from(planRuns)
				.all()
				.map((r) => r.id),
		).toEqual(["first", "second"]);
	});
});
