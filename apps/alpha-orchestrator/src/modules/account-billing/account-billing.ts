import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import type { PriceBook } from "../prices/prices.service.ts";
import { AccountBilling, AccountParams } from "./account-billing.schema.ts";
import {
	accountBilling,
	adjustBalance,
	setManualPlan,
} from "./account-billing.service.ts";

export interface AccountBillingDeps {
	db: Db;
	now: () => number;
	prices?: PriceBook;
	polarBaseUrl?: string;
	/** A staff change to this account's plan or balance. */
	onAccountChanged?: (accountId: string) => void;
}

/** Admin routes: billing of one account and staff corrections to it. Auth is the app's `onRequest` guard. */
export function accountBillingRoutes({
	db,
	now,
	prices,
	polarBaseUrl,
	onAccountChanged,
}: AccountBillingDeps) {
	const view = async (accountId: string) =>
		accountBilling(db, accountId, {
			now: now(),
			prices: (await prices?.get()) ?? null,
			polarBaseUrl,
		});
	return new Elysia({
		prefix: "/v1/admin/accounts",
		tags: ["Admin: subscriptions"],
	})
		.get("/:accountId/billing", ({ params }) => view(params.accountId), {
			params: AccountParams,
			response: { 200: AccountBilling },
			detail: {
				summary: "Billing of one account",
				description:
					"Standing (plan in effect and balance above zero), the plan, the TR balance, paid orders and spend per month. An unknown account is an empty one (`no_plan`, balance 0).",
			},
		})
		.post(
			"/:accountId/balance",
			({ params, body, request }) => {
				adjustBalance(
					db,
					params.accountId,
					body.amountUsd,
					request.headers.get("x-admin-id") ?? "",
					now(),
				);
				onAccountChanged?.(params.accountId);
				return view(params.accountId);
			},
			{
				params: AccountParams,
				body: t.Object({
					/** Signed TR (= USD): positive adds, negative takes away. */
					amountUsd: t.Number({
						minimum: -10_000,
						maximum: 10_000,
					}),
				}),
				response: { 200: AccountBilling },
				detail: {
					summary: "Adjust an account's balance",
					description:
						"Adds a signed `adjustment` row to the ledger (ref = `X-Admin-Id`); answers the account's billing.",
				},
			},
		)
		.put(
			"/:accountId/plan",
			({ params, body }) => {
				setManualPlan(db, params.accountId, body.until, now());
				onAccountChanged?.(params.accountId);
				return view(params.accountId);
			},
			{
				params: AccountParams,
				body: t.Object({
					/** Epoch ms the granted plan runs until; `null` ends it now. */
					until: t.Nullable(t.Number()),
				}),
				response: { 200: AccountBilling },
				detail: {
					summary: "Grant or end a manual plan",
					description:
						"A plan outside Polar (`manual:<accountId>`, does not renew). Does not touch the balance or Polar's own subscriptions. Answers the account's billing.",
				},
			},
		);
}
