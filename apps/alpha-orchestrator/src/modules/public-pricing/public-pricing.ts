import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { readFinanceRates } from "../finance/finance.service.ts";
import type { PriceBook } from "../prices/prices.service.ts";
import { PublicPricing } from "./public-pricing.schema.ts";
import { modelsOf, topUpsOf } from "./public-pricing.service.ts";

export interface PublicPricingDeps {
	db: Db;
	now: () => number;
	prices?: PriceBook;
}

/** Unauthenticated price list for the landing (cross-origin, cacheable). */
export function publicPricingRoutes({ db, now, prices }: PublicPricingDeps) {
	return new Elysia({ prefix: "/v1/public", tags: ["Public"] }).get(
		"/pricing",
		async ({ set }) => {
			set.headers["cache-control"] = "public, max-age=300";
			set.headers["access-control-allow-origin"] = "*";
			return {
				currency: "USD" as const,
				unit: "TR (1 TR = 1 USD of model usage)",
				topUps: topUpsOf(readFinanceRates(db)),
				models: modelsOf(db, (await prices?.get()) ?? null),
				updatedAt: now(),
			};
		},
		{
			response: { 200: PublicPricing },
			detail: {
				summary: "Public pricing",
				description:
					"What a top-up of 5/10/20/50 USD credits (after fees and taxes and the service share) and TR per 1M tokens of the models in use.",
			},
		},
	);
}
