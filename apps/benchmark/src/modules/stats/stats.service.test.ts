import { describe, expect, test } from "bun:test";
import { summarizeLatency, summarizeRuns } from "./stats.service.ts";

test("summarizeLatency reports nearest-rank percentiles and decisions per second", () => {
	const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100 ms
	const summary = summarizeLatency(samples);
	expect(summary.count).toBe(100);
	expect(summary.p50).toBe(50);
	expect(summary.p90).toBe(90);
	expect(summary.p99).toBe(99);
	expect(summary.max).toBe(100);
	expect(summary.mean).toBeCloseTo(50.5);
	// 100 decisions in 5050 ms of inference.
	expect(summary.decisionsPerSecond).toBeCloseTo(100 / 5.05);
});

test("summarizeLatency of no samples is all zeros, not NaN", () => {
	expect(summarizeLatency([])).toEqual({
		count: 0,
		mean: 0,
		p50: 0,
		p90: 0,
		p99: 0,
		max: 0,
		decisionsPerSecond: 0,
	});
});

describe("summarizeRuns", () => {
	test("accuracy, valid share and latency percentiles", () => {
		const runs = [
			{ ok: true, valid: true, latencyMs: 100 },
			{ ok: false, valid: true, latencyMs: 200 },
			{ ok: false, valid: false, latencyMs: 300 },
			{ ok: true, valid: true, latencyMs: 400 },
		];
		expect(summarizeRuns(runs)).toEqual({
			cases: 4,
			accuracy: 0.5,
			valid: 0.75,
			p50Ms: 200,
			p90Ms: 400,
			meanMs: 250,
		});
	});

	test("no runs, no numbers", () => {
		expect(summarizeRuns([])).toEqual({
			cases: 0,
			accuracy: 0,
			valid: 0,
			p50Ms: 0,
			p90Ms: 0,
			meanMs: 0,
		});
	});
});
