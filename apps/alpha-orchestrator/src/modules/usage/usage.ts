import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";
import type { PriceBook } from "../prices/prices.service.ts";
import { UsageQuery, UsageReport } from "./usage.schema.ts";
import { usageRows } from "./usage.service.ts";

export interface UsageDeps {
	db: Db;
	now: () => number;
	/** Model prices for `costUsd`; without it (or if they cannot be fetched) costs are `null`. */
	prices?: PriceBook;
}

/** Admin route: token usage (and spend, when prices are known) grouped by day, visitor, channel or model. */
export function usageRoutes({ db, now, prices }: UsageDeps) {
	return new Elysia({
		prefix: "/v1/admin/usage",
		tags: ["Admin: usage & stats"],
	}).get(
		"/",
		async ({ query }) => {
			const current = now();
			return {
				rows: usageRows(
					db,
					query.groupBy,
					query.from ?? current - 30 * DAY_MS,
					query.to ?? current,
					query.channel,
					await prices?.get(),
					query.ownerId,
				),
			};
		},
		{
			query: UsageQuery,
			response: { 200: UsageReport },
			detail: {
				summary: "Get token usage",
				description:
					"Tokens, calls and (when prices are known) spend grouped by `groupBy`. `from`/`to` are epoch ms and default to the last 30 days; `channel` is a channel slug.",
			},
		},
	);
}
