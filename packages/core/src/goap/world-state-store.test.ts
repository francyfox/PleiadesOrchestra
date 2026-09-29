import { describe, expect, test } from "bun:test";
import { InMemoryWorldStateStore } from "./world-state-store.ts";

describe("InMemoryWorldStateStore", () => {
	test("load returns undefined for a thread that was never saved", async () => {
		const store = new InMemoryWorldStateStore();
		expect(await store.load("thread-1")).toBeUndefined();
	});

	test("save then load round-trips the state", async () => {
		const store = new InMemoryWorldStateStore();
		await store.save("thread-1", { inCart: true, budget: 500 });
		expect(await store.load("thread-1")).toEqual({ inCart: true, budget: 500 });
	});

	test("save overwrites the previous state for that thread", async () => {
		const store = new InMemoryWorldStateStore();
		await store.save("thread-1", { step: "search" });
		await store.save("thread-1", { step: "checkout" });
		expect(await store.load("thread-1")).toEqual({ step: "checkout" });
	});

	test("clear removes the stored state", async () => {
		const store = new InMemoryWorldStateStore();
		await store.save("thread-1", { inCart: true });
		await store.clear("thread-1");
		expect(await store.load("thread-1")).toBeUndefined();
	});

	test("threads are isolated from each other", async () => {
		const store = new InMemoryWorldStateStore();
		await store.save("thread-1", { inCart: true });
		await store.save("thread-2", { inCart: false });
		expect(await store.load("thread-1")).toEqual({ inCart: true });
		expect(await store.load("thread-2")).toEqual({ inCart: false });
	});
});
