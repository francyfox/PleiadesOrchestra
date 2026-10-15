import type { LatencySummary, Run, Summary } from "./stats.types.ts";

/** Nearest-rank percentile over already-sorted samples. */
function percentile(sorted: number[], p: number): number {
	const rank = Math.ceil((p / 100) * sorted.length);
	return sorted[Math.max(rank - 1, 0)] ?? 0;
}

export function summarizeLatency(samplesMs: number[]): LatencySummary {
	if (samplesMs.length === 0) {
		return {
			count: 0,
			mean: 0,
			p50: 0,
			p90: 0,
			p99: 0,
			max: 0,
			decisionsPerSecond: 0,
		};
	}
	const sorted = [...samplesMs].sort((a, b) => a - b);
	const total = sorted.reduce((sum, value) => sum + value, 0);
	return {
		count: sorted.length,
		mean: total / sorted.length,
		p50: percentile(sorted, 50),
		p90: percentile(sorted, 90),
		p99: percentile(sorted, 99),
		max: sorted.at(-1) ?? 0,
		decisionsPerSecond: sorted.length / (total / 1000),
	};
}

/** Accuracy, parseable share and latency of runs; built on `summarizeLatency`. */
export function summarizeRuns(runs: Run[]): Summary {
	if (runs.length === 0) {
		return { cases: 0, accuracy: 0, valid: 0, p50Ms: 0, p90Ms: 0, meanMs: 0 };
	}
	const latency = summarizeLatency(runs.map((run) => run.latencyMs));
	return {
		cases: runs.length,
		accuracy: runs.filter((run) => run.ok).length / runs.length,
		valid: runs.filter((run) => run.valid).length / runs.length,
		p50Ms: latency.p50,
		p90Ms: latency.p90,
		meanMs: latency.mean,
	};
}
