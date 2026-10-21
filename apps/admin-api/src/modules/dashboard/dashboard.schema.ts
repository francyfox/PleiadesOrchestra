import { t } from "elysia";
import { nullable } from "../common/common.schema.ts";
import { Finance } from "../finance/finance.schema.ts";
import { Stats } from "../stats/stats.schema.ts";
import { UsageRow } from "../usage/usage.schema.ts";

export const Dashboard = t.Object({
	stats: Stats,
	/** Staff only, whole-system view (no `ownerId`). */
	finance: t.Optional(Finance),
	byDay: t.Array(
		t.Object({
			day: t.String(),
			inputTokens: t.Number(),
			outputTokens: t.Number(),
			costUsd: nullable(t.Number()),
		}),
	),
	topVisitors: t.Array(UsageRow),
	byChannel: t.Array(UsageRow),
	byModel: t.Array(UsageRow),
});
