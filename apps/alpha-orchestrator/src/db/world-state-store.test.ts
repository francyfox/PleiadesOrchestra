import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb } from "../test/db.ts";
import { resolveThreadId, upsertIdentifiedUser } from "./identity.ts";
import { threads } from "./schema.ts";
import { SqliteWorldStateStore } from "./world-state-store.ts";

function setup() {
	const db = testDb();
	const user = upsertIdentifiedUser(db, "ch_cli", "u1", undefined, 1);
	const threadA = resolveThreadId(db, "ch_cli", user.id, "a", 1);
	const threadB = resolveThreadId(db, "ch_cli", user.id, "b", 1);
	const store = new SqliteWorldStateStore(db, () => 100);
	return { db, threadA, threadB, store };
}

describe("SqliteWorldStateStore", () => {
	test("load returns undefined for a thread that was never saved", async () => {
		const { threadA, store } = setup();
		expect(await store.load(threadA)).toBeUndefined();
	});

	test("save then load round-trips the state and the goal", async () => {
		const { threadA, store } = setup();
		await store.save(threadA, {
			state: { inCart: true, budget: 500 },
			goal: { replied: true, inCart: true },
		});
		expect(await store.load(threadA)).toEqual({
			state: { inCart: true, budget: 500 },
			goal: { replied: true, inCart: true },
		});
	});

	test("save overwrites the previous checkpoint for that thread", async () => {
		const { threadA, store } = setup();
		await store.save(threadA, {
			state: { step: "search" },
			goal: { replied: true },
		});
		await store.save(threadA, {
			state: { step: "checkout" },
			goal: { replied: true, checkoutComplete: true },
		});
		expect(await store.load(threadA)).toEqual({
			state: { step: "checkout" },
			goal: { replied: true, checkoutComplete: true },
		});
	});

	test("clear removes the stored checkpoint", async () => {
		const { threadA, store } = setup();
		await store.save(threadA, { state: { inCart: true }, goal: { replied: true } });
		await store.clear(threadA);
		expect(await store.load(threadA)).toBeUndefined();
	});

	test("threads are isolated from each other", async () => {
		const { threadA, threadB, store } = setup();
		await store.save(threadA, { state: { inCart: true }, goal: { replied: true } });
		await store.save(threadB, { state: { inCart: false }, goal: { replied: true } });
		expect(await store.load(threadA)).toEqual({
			state: { inCart: true },
			goal: { replied: true },
		});
		expect(await store.load(threadB)).toEqual({
			state: { inCart: false },
			goal: { replied: true },
		});
	});

	test("deleting the thread cascades to its stored checkpoint", async () => {
		const { db, threadA, store } = setup();
		await store.save(threadA, { state: { inCart: true }, goal: { replied: true } });
		db.delete(threads).where(eq(threads.id, threadA)).run();
		expect(await store.load(threadA)).toBeUndefined();
	});
});
