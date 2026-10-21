import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import type { PriceBook } from "../prices/prices.service.ts";
import { AccountBilling, AccountParams } from "./account-billing.schema.ts";
import { accountBilling } from "./account-billing.service.ts";

export interface AccountBillingDeps {
	db: Db;
	now: () => number;
	prices?: PriceBook;
	polarBaseUrl?: string;
}

/** Admin route: plan, standing, TR balance, orders and monthly spend of one account. Auth is the app's `onRequest` guard. */
export function accountBillingRoutes({
	db,
	now,
	prices,
	polarBaseUrl,
}: AccountBillingDeps) {
	return new Elysia({
		prefix: "/v1/admin/accounts",
		tags: ["Admin: subscriptions"],
	}).get(
		"/:accountId/billing",
		async ({ params }) =>
			accountBilling(db, params.accountId, {
				now: now(),
				prices: (await prices?.get()) ?? null,
				polarBaseUrl,
			}),
		{
			params: AccountParams,
			response: { 200: AccountBilling },
			detail: {
				summary: "Billing of one account",
				description:
					"Standing (plan in effect and balance above zero), the plan, the TR balance, paid orders and spend per month. An unknown account is an empty one (`no_plan`, balance 0).",
			},
		},
	);
}
