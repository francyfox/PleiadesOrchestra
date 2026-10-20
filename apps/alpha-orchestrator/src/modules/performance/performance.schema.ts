import { t } from "elysia";

export const PerformanceQuery = t.Object({
	/** Period start, epoch ms (default: 30 days ago). */
	from: t.Optional(t.Numeric()),
	/** Period end, epoch ms (default: now). */
	to: t.Optional(t.Numeric()),
});

/** Latencies are in ms. */
const LatencyStats = t.Object({
	calls: t.Number(),
	failed: t.Number(),
	p50: t.Number(),
	p90: t.Number(),
	p99: t.Number(),
	max: t.Number(),
	/** Median output tokens/s; null when no call reported usage. */
	tokensPerSecond: t.Nullable(t.Number()),
});

export const PerformanceReport = t.Object({
	/** Per UTC day and call kind. */
	rows: t.Array(
		t.Composite([
			LatencyStats,
			t.Object({ day: t.String(), kind: t.String() }),
		]),
	),
	/** Per call kind over the whole period. */
	overall: t.Array(t.Composite([LatencyStats, t.Object({ kind: t.String() })])),
});
