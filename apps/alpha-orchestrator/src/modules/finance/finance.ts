import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";
import type { PriceBook } from "../prices/prices.service.ts";
import { Finance, FinanceQuery } from "./finance.schema.ts";
import { financeReport } from "./finance.service.ts";

export interface FinanceDeps {
	db: Db;
	now: () => number;
	prices?: PriceBook;
}

/** Staff money numbers for a period (admin-api only lets staff reach it). */
export function financeRoutes({ db, now, prices }: FinanceDeps) {
	return new Elysia({
		prefix: "/v1/admin/finance",
		tags: ["Admin: usage & stats"],
	}).get(
		"/",
		async ({ query }) => {
			const current = now();
			return financeReport(
				db,
				query.from ?? current - 30 * DAY_MS,
				query.to ?? current,
				(await prices?.get()) ?? null,
			);
		},
		{
			query: FinanceQuery,
			response: { 200: Finance },
			detail: {
				summary: "Model spend, revenue, losses and net profit",
				description:
					"USD for `from`..`to` (epoch ms, default the last 30 days): model spend, paid orders net of refunds, per-order fee/tax losses (`@repo/tax`) and net profit. Orders in other currencies are counted in `skippedOrders` only.",
			},
		},
	);
}
