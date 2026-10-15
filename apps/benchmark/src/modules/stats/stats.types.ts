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

/** One measured attempt: right or not, parseable or not, and how long it took. */
export interface Run {
	ok: boolean;
	/** The model produced parseable arguments at all. */
	valid: boolean;
	latencyMs: number;
}

export interface Summary {
	cases: number;
	accuracy: number;
	valid: number;
	p50Ms: number;
	p90Ms: number;
	meanMs: number;
}
