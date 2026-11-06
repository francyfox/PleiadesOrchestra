import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { adminIdOf, DAY_MS } from "../http/http.service.ts";
import type { PriceBook } from "../prices/prices.service.ts";
import { Finance, FinanceQuery, FinanceRates } from "./finance.schema.ts";
import {
	financeReport,
	readFinanceRates,
	saveFinanceRates,
} from "./finance.service.ts";

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
	})
		.get(
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
		)
		.get("/rates", () => readFinanceRates(db), {
			response: { 200: FinanceRates },
			detail: {
				summary: "Finance rates",
				description:
					"The rates the numbers above are computed with, in percent (fixed fee in USD); the commission doc's defaults until staff save their own.",
			},
		})
		.put(
			"/rates",
			({ body, request }) => {
				saveFinanceRates(db, body, adminIdOf(request), now());
				return body;
			},
			{
				body: FinanceRates,
				response: { 200: FinanceRates },
				detail: {
					summary: "Save finance rates",
					description:
						"Replaces all rates at once (percent 0-100, `feeFixedUsd` >= 0, `taxBase` payout|revenue). Applies to every period shown.",
				},
			},
		);
}
