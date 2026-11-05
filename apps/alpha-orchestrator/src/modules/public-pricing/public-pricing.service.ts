import { creditFor, orderBreakdown } from "@repo/tax";
import { eq } from "drizzle-orm";
import { llmCalls } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import type { FinanceRatesValue } from "../finance/finance.schema.ts";
import { ratesOf } from "../finance/finance.service.ts";
import type { Prices } from "../prices/prices.service.ts";

export const TOP_UP_AMOUNTS_USD = [5, 10, 20, 50];

const cents = (n: number) => Math.round(n * 100) / 100;
const perMillion = (n: number) => Math.round(n * 1e6 * 1e6) / 1e6;

/**
 * What a top-up gives, by the same `creditFor` billing credits with. Staff's
 * tax setup stays private: only fees+taxes and the service margin are shown.
 */
export function topUpsOf(rates: FinanceRatesValue) {
	return TOP_UP_AMOUNTS_USD.map((paidUsd) => {
		const creditedTr = cents(
			creditFor(paidUsd, ratesOf(rates), rates.marginPercent / 100),
		);
		const feesAndTaxUsd = cents(orderBreakdown(paidUsd, ratesOf(rates)).losses);
		return {
			paidUsd,
			creditedTr,
			feesAndTaxUsd,
			serviceUsd: cents(paidUsd - creditedTr - feesAndTaxUsd),
		};
	});
}

/** Models with a call in the ledger (what channels/agents really use) that have a price, by id; max `limit`. */
export function modelsOf(db: Db, prices: Prices | null, limit = 30) {
	if (!prices) return [];
	return db
		.selectDistinct({ model: llmCalls.model })
		.from(llmCalls)
		.where(eq(llmCalls.ok, true))
		.all()
		.map((row) => row.model)
		.filter((id) => prices.has(id))
		.sort()
		.slice(0, limit)
		.map((id) => {
			const p = prices.get(id) as NonNullable<ReturnType<Prices["get"]>>;
			return {
				id,
				inputPerMillionTr: perMillion(p.input),
				outputPerMillionTr: perMillion(p.output),
				...(p.cacheRead === undefined
					? {}
					: { cacheReadPerMillionTr: perMillion(p.cacheRead) }),
			};
		});
}
