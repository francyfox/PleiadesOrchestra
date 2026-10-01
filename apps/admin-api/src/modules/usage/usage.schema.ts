import { type Static, t } from "elysia";
import { CallKind, nullable } from "../common/common.schema.ts";

export const UsageGroupBy = t.UnionEnum(["day", "user", "channel", "model"]);

export const UsageTotals = t.Object({
	inputTokens: t.Number(),
	outputTokens: t.Number(),
	calls: t.Number(),
	callsWithoutUsage: t.Number(),
});

export const UsageByDay = t.Composite([
	UsageTotals,
	t.Object({ day: t.String() }),
]);

export const UsageByModel = t.Composite([
	UsageTotals,
	t.Object({ model: t.String(), kind: CallKind, avgLatencyMs: t.Number() }),
]);

export const UsageRow = t.Composite([
	UsageTotals,
	t.Object({
		key: nullable(t.String()),
		label: t.String(),
		avgLatencyMs: t.Number(),
	}),
]);

export type UsageGroupBy = Static<typeof UsageGroupBy>;
export type UsageTotals = Static<typeof UsageTotals>;
export type UsageByDay = Static<typeof UsageByDay>;
export type UsageByModel = Static<typeof UsageByModel>;
export type UsageRow = Static<typeof UsageRow>;
