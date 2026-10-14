import { expect, test } from "bun:test";
import { summarize } from "./stats.ts";

test("summarize reports nearest-rank percentiles and decisions per second", () => {
	const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100 ms
	const summary = summarize(samples);
	expect(summary.count).toBe(100);
	expect(summary.p50).toBe(50);
	expect(summary.p90).toBe(90);
	expect(summary.p99).toBe(99);
	expect(summary.max).toBe(100);
	expect(summary.mean).toBeCloseTo(50.5);
	// 100 decisions in 5050 ms of inference.
	expect(summary.decisionsPerSecond).toBeCloseTo(100 / 5.05);
});

test("summarize of no samples is all zeros, not NaN", () => {
	expect(summarize([])).toEqual({
		count: 0,
		mean: 0,
		p50: 0,
		p90: 0,
		p99: 0,
		max: 0,
		decisionsPerSecond: 0,
	});
});
