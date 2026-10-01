import { type Static, t } from "elysia";
import { CallKind, nullable } from "../common/common.schema.ts";

export const LatencyStats = t.Object({
	calls: t.Number(),
	failed: t.Number(),
	p50: t.Number(),
	p90: t.Number(),
	p99: t.Number(),
	max: t.Number(),
	/** Median output tokens/s; null when no call reported usage (Laya never does). */
	tokensPerSecond: nullable(t.Number()),
});

export const PerformanceReport = t.Object({
	rows: t.Array(
		t.Composite([LatencyStats, t.Object({ day: t.String(), kind: CallKind })]),
	),
	overall: t.Array(t.Composite([LatencyStats, t.Object({ kind: CallKind })])),
});

export type LatencyStats = Static<typeof LatencyStats>;
export type PerformanceReport = Static<typeof PerformanceReport>;
