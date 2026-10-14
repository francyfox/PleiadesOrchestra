export interface LatencySummary {
	count: number;
	mean: number;
	p50: number;
	p90: number;
	p99: number;
	max: number;
	/** Completed decisions per second of inference time alone. */
	decisionsPerSecond: number;
}

/** Nearest-rank percentile over already-sorted samples. */
function percentile(sorted: number[], p: number): number {
	const rank = Math.ceil((p / 100) * sorted.length);
	return sorted[Math.max(rank - 1, 0)] ?? 0;
}

export function summarize(samplesMs: number[]): LatencySummary {
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
