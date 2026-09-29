import { describe, expect, test } from "bun:test";
import { InMemoryWorldStateStore } from "./world-state-store.ts";

describe("InMemoryWorldStateStore", () => {
	test("load returns undefined for a thread that was never saved", async () => {
		const store = new InMemoryWorldStateStore();
		expect(await store.load("thread-1")).toBeUndefined();
	});

	test("save then load round-trips the state and the goal", async () => {
		const store = new InMemoryWorldStateStore();
		await store.save("thread-1", {
			state: { inCart: true, budget: 500 },
			goal: { replied: true, inCart: true },
		});
		expect(await store.load("thread-1")).toEqual({
			state: { inCart: true, budget: 500 },
			goal: { replied: true, inCart: true },
		});
	});

	test("save overwrites the previous checkpoint for that thread", async () => {
		const store = new InMemoryWorldStateStore();
		await store.save("thread-1", {
			state: { step: "search" },
			goal: { replied: true },
		});
		await store.save("thread-1", {
			state: { step: "checkout" },
			goal: { replied: true, checkoutComplete: true },
		});
		expect(await store.load("thread-1")).toEqual({
			state: { step: "checkout" },
			goal: { replied: true, checkoutComplete: true },
		});
	});

	test("clear removes the stored checkpoint", async () => {
		const store = new InMemoryWorldStateStore();
		await store.save("thread-1", {
			state: { inCart: true },
			goal: { replied: true },
		});
		await store.clear("thread-1");
		expect(await store.load("thread-1")).toBeUndefined();
	});

	test("threads are isolated from each other", async () => {
		const store = new InMemoryWorldStateStore();
		await store.save("thread-1", {
			state: { inCart: true },
			goal: { replied: true },
		});
		await store.save("thread-2", {
			state: { inCart: false },
			goal: { replied: true },
		});
		expect(await store.load("thread-1")).toEqual({
			state: { inCart: true },
			goal: { replied: true },
		});
		expect(await store.load("thread-2")).toEqual({
			state: { inCart: false },
			goal: { replied: true },
		});
	});
});
