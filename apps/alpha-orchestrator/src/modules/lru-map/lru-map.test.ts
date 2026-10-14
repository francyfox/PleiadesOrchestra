import { describe, expect, test } from "bun:test";
import { LruMap } from "./lru-map.ts";

describe("LruMap", () => {
	test("drops the least recently used entry beyond maxEntries", () => {
		const map = new LruMap<string, number>({ maxEntries: 2 });
		map.set("a", 1);
		map.set("b", 2);
		map.get("a"); // "b" is now the oldest
		map.set("c", 3);
		expect([...map.keys()].sort()).toEqual(["a", "c"]);
		expect(map.size).toBe(2);
	});

	test("overwriting a key keeps the size and refreshes its recency", () => {
		const map = new LruMap<string, number>({ maxEntries: 2 });
		map.set("a", 1);
		map.set("b", 2);
		map.set("a", 10);
		map.set("c", 3);
		expect(map.get("a")).toBe(10);
		expect(map.has("b")).toBe(false);
	});

	test("an entry older than ttlMs is gone", () => {
		const clock = { now: 0 };
		const map = new LruMap<string, number>({
			maxEntries: 10,
			ttlMs: 1000,
			now: () => clock.now,
		});
		map.set("a", 1);
		clock.now = 999;
		expect(map.get("a")).toBe(1);
		clock.now = 2000; // the read above did not extend the lifetime
		expect(map.get("a")).toBeUndefined();
		expect(map.has("a")).toBe(false);
		expect(map.size).toBe(0);
	});

	test("expired entries are evicted before live ones when full", () => {
		const clock = { now: 0 };
		const map = new LruMap<string, number>({
			maxEntries: 2,
			ttlMs: 1000,
			now: () => clock.now,
		});
		map.set("old", 1);
		clock.now = 900;
		map.set("fresh", 2);
		map.get("old"); // recent use, but expires first
		clock.now = 1100;
		map.set("new", 3);
		expect([...map.keys()].sort()).toEqual(["fresh", "new"]);
	});
});
