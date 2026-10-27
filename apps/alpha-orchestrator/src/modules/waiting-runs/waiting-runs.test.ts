import { describe, expect, test } from "bun:test";
import { testDb } from "../database/database.testing.ts";
import { pendingOf } from "../pending/pending.service.ts";
import {
	BROWSER_WAIT_TIMEOUT_MS,
	EXPIRED_FACT,
	VISITOR_WAIT_TIMEOUT_MS,
} from "../run-stream/run-stream.service.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
import { SqliteWorldStateStore } from "../world-state/world-state.ts";
import { expireStaleWaits } from "./waiting-runs.service.ts";

function setup() {
	const db = testDb();
	const visitor = upsertIdentifiedVisitor(db, "ch_cli", "u1", undefined, 1);
	const thread = (key: string) =>
		resolveThreadId(db, "ch_cli", visitor.id, key, 1);
	let now = 0;
	const store = new SqliteWorldStateStore(db, () => now);
	return {
		db,
		thread,
		store,
		at: (ms: number) => {
			now = ms;
		},
	};
}

const WAITING = {
	planRunId: "run-1",
	awaitedTool: "add_to_cart",
	store: "shop",
	lastProduct: "iPhone 5s",
	userMessage: "бери",
	userMessageRaw: "бери и ещё сыр",
	taskQueue: JSON.stringify([{ intent: "search", text: "cheese" }]),
};

const marker = (state?: Record<string, unknown>) =>
	JSON.parse(String(state?.[EXPIRED_FACT]));

describe("expireStaleWaits", () => {
	test("a run that waited for the browser past the limit drops its checkpoint, keeping only the conversation's facts", async () => {
		const { db, thread, store, at } = setup();
		const t = thread("a");
		at(1_000);
		await store.save(t, { state: WAITING, goal: { inCart: true } });

		const expired = expireStaleWaits(db, 1_000 + BROWSER_WAIT_TIMEOUT_MS + 1);

		expect(expired).toBe(1);
		const kept = await store.load(t);
		expect(kept?.state).toMatchObject({
			store: "shop",
			lastProduct: "iPhone 5s",
		});
		expect(kept?.state.awaitedTool).toBeUndefined();
		expect(marker(kept?.state)).toEqual({
			prompt: "бери и ещё сыр",
			tasksLeft: 1,
		});
		expect(kept?.goal).toEqual({});
	});

	test("a marker nobody read goes after a day, the conversation's facts stay", async () => {
		const { db, thread, store, at } = setup();
		const t = thread("a");
		at(1_000);
		await store.save(t, { state: WAITING, goal: {} });
		const expiredAt = 1_000 + BROWSER_WAIT_TIMEOUT_MS + 1;
		expireStaleWaits(db, expiredAt);
		expect((await store.load(t))?.state[EXPIRED_FACT]).toBeDefined();

		expireStaleWaits(db, expiredAt + 24 * 60 * 60 * 1000 + 1);

		expect(await store.load(t)).toEqual({
			state: { store: "shop", lastProduct: "iPhone 5s" },
			goal: {},
		});
	});

	test("a wait inside the limit and a checkpoint that waits for nothing are left alone", async () => {
		const { db, thread, store, at } = setup();
		const fresh = thread("fresh");
		const idle = thread("idle");
		at(100_000);
		await store.save(fresh, { state: WAITING, goal: { inCart: true } });
		at(1_000);
		await store.save(idle, { state: { store: "shop" }, goal: {} });

		expect(expireStaleWaits(db, 100_000 + BROWSER_WAIT_TIMEOUT_MS - 1)).toBe(0);
		expect((await store.load(fresh))?.state.awaitedTool).toBe("add_to_cart");
		expect(await store.load(idle)).toEqual({
			state: { store: "shop" },
			goal: {},
		});
	});
});

describe("a question waiting for the visitor", () => {
	const ASKED = {
		store: "shop",
		userMessage: "забронируй",
		visitorWait: JSON.stringify({
			request: "book a slot",
			asked: ["the date"],
		}),
	};

	test("outlives the browser timeout, then goes quietly: conversation facts stay, no marker", async () => {
		const { db, thread, store, at } = setup();
		const t = thread("a");
		at(1_000);
		await store.save(t, { state: ASKED, goal: { booked: true } });

		expect(expireStaleWaits(db, 1_000 + BROWSER_WAIT_TIMEOUT_MS + 1)).toBe(0);
		expect((await store.load(t))?.state.visitorWait).toBeDefined();

		expect(expireStaleWaits(db, 1_000 + VISITOR_WAIT_TIMEOUT_MS + 1)).toBe(1);
		const kept = await store.load(t);
		expect(kept?.state).toEqual({ store: "shop" });
		expect(kept?.goal).toEqual({});
	});

	test("pending does not mistake it for a browser wait", async () => {
		const { db, thread, store } = setup();
		const t = thread("a");
		await store.save(t, { state: ASKED, goal: { booked: true } });
		expect(await pendingOf(db, t)).toEqual({ state: "none" });
	});
});
