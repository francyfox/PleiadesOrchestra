import { t } from "elysia";

const Totals = t.Object({
	inputTokens: t.Number(),
	outputTokens: t.Number(),
	calls: t.Number(),
	callsWithoutUsage: t.Number(),
});

export const Stats = t.Object({
	visitors: t.Object({
		total: t.Number(),
		pending: t.Number(),
		blocked: t.Number(),
		anonymous: t.Number(),
	}),
	/** Token totals since UTC midnight and over the last 7 and 30 days. */
	usage: t.Object({ today: Totals, last7d: Totals, last30d: Totals }),
});
