import { describe, expect, test } from "bun:test";
import type { SystemSnapshot } from "../system/system.schema.ts";
import { createSystemFeed } from "./system-feed.ts";

const snap = (at: number) => ({ at }) as SystemSnapshot;

function fakeTimers() {
	const timers = new Map<number, () => void>();
	let next = 1;
	return {
		timers,
		setInterval: (fn: () => void) => {
			timers.set(next, fn);
			return next++;
		},
		clearInterval: (id: unknown) => {
			timers.delete(id as number);
		},
		tick: async () => {
			for (const fn of [...timers.values()]) fn();
			await Bun.sleep(0);
		},
	};
}

describe("createSystemFeed", () => {
	test("runs no timer until someone subscribes", () => {
		const t = fakeTimers();
		createSystemFeed({ snapshot: async () => snap(1), intervalMs: 5, ...t });
		expect(t.timers.size).toBe(0);
	});

	test("one timer serves every subscriber and stops with the last one", async () => {
		const t = fakeTimers();
		let calls = 0;
		const feed = createSystemFeed({
			snapshot: async () => snap(++calls),
			intervalMs: 5,
			...t,
		});
		const a: number[] = [];
		const b: number[] = [];
		const offA = feed.subscribe((s) => a.push(s.at));
		const offB = feed.subscribe((s) => b.push(s.at));
		expect(t.timers.size).toBe(1);

		await t.tick();
		expect(a).toEqual([1]);
		expect(b).toEqual([1]);

		offA();
		expect(t.timers.size).toBe(1);
		await t.tick();
		expect(a).toEqual([1]);
		expect(b).toEqual([1, 2]);

		offB();
		expect(t.timers.size).toBe(0);
	});

	test("a failing snapshot doesn't kill the timer or the subscribers", async () => {
		const t = fakeTimers();
		let calls = 0;
		const feed = createSystemFeed({
			snapshot: async () => {
				if (++calls === 1) throw new Error("probe failed");
				return snap(calls);
			},
			intervalMs: 5,
			...t,
		});
		const seen: number[] = [];
		feed.subscribe((s) => seen.push(s.at));
		await t.tick();
		await t.tick();
		expect(seen).toEqual([2]);
		expect(t.timers.size).toBe(1);
	});

	test("unsubscribing twice is harmless", () => {
		const t = fakeTimers();
		const feed = createSystemFeed({
			snapshot: async () => snap(1),
			intervalMs: 5,
			...t,
		});
		const off = feed.subscribe(() => {});
		off();
		off();
		expect(t.timers.size).toBe(0);
	});
});
