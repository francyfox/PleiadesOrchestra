import { t } from "elysia";
import { Stats } from "../stats/stats.schema.ts";
import { UsageRow } from "../usage/usage.schema.ts";

export const Dashboard = t.Object({
	stats: Stats,
	byDay: t.Array(
		t.Object({
			day: t.String(),
			inputTokens: t.Number(),
			outputTokens: t.Number(),
		}),
	),
	topUsers: t.Array(UsageRow),
	byChannel: t.Array(UsageRow),
});
