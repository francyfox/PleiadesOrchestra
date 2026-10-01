import { type Static, t } from "elysia";
import { UsageTotals } from "../usage/usage.schema.ts";

export const Stats = t.Object({
	users: t.Object({
		total: t.Number(),
		pending: t.Number(),
		blocked: t.Number(),
		anonymous: t.Number(),
	}),
	usage: t.Object({
		today: UsageTotals,
		last7d: UsageTotals,
		last30d: UsageTotals,
	}),
});

export type Stats = Static<typeof Stats>;
