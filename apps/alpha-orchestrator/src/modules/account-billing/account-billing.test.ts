import { describe, expect, test } from "bun:test";
import {
	channels,
	creditLedger,
	orders,
	subscriptions,
} from "../database/database.schema.ts";
import {
	admin,
	DAY,
	json,
	NOW,
	seedLlmCall,
	setupAdminApp,
} from "../http/http.testing.ts";
import { accountBilling } from "./account-billing.service.ts";

function seedAccount(db: ReturnType<typeof setupAdminApp>["db"]) {
	db.insert(subscriptions)
		.values({
			id: "sub_old",
			accountId: "acc_1",
			customerId: "cus_1",
			status: "canceled",
			currentPeriodEnd: NOW - 40 * DAY,
			cancelAtPeriodEnd: false,
			updatedAt: NOW,
		})
		.run();
	db.insert(subscriptions)
		.values({
			id: "sub_new",
			accountId: "acc_1",
			customerId: "cus_1",
			status: "active",
			currentPeriodEnd: NOW + 5 * DAY,
			cancelAtPeriodEnd: false,
			updatedAt: NOW,
		})
		.run();
	db.insert(orders)
		.values([
			{
				id: "o1",
				accountId: "acc_1",
				kind: "credits",
				amount: 1000,
				currency: "usd",
				status: "paid",
				createdAt: NOW - DAY,
			},
			{
				id: "o2",
				accountId: "acc_1",
				kind: "plan",
				amount: 500,
				currency: "usd",
				status: "paid",
				createdAt: NOW - 2 * DAY,
			},
			{
				id: "o3",
				accountId: "other",
				kind: "plan",
				amount: 500,
				currency: "usd",
				status: "paid",
				createdAt: NOW,
			},
		])
		.run();
	db.insert(creditLedger)
		.values([
			{
				accountId: "acc_1",
				amount: 10_000_000,
				reason: "top_up",
				ref: "o1",
				createdAt: NOW,
			},
			{
				accountId: "acc_1",
				amount: -40,
				reason: "usage",
				ref: "1",
				createdAt: NOW,
			},
		])
		.run();
}

describe("accountBilling", () => {
	test("the running plan, ledger balance, own orders newest first and monthly spend", () => {
		const { db } = setupAdminApp();
		seedAccount(db);
		db.update(channels).set({ ownerId: "acc_1" }).run();
		seedLlmCall(db, null, NOW - 40 * DAY, 100, 50);
		seedLlmCall(db, null, NOW - DAY, 10, 5);
		seedLlmCall(db, null, NOW - DAY, 10, 5);

		const prices = new Map([["vikhr", { input: 0.001, output: 0.002 }]]);
		const result = accountBilling(db, "acc_1", { now: NOW, prices });
		expect(result.standing).toEqual({ ok: true, until: null });
		expect(result.subscription?.id).toBe("sub_new");
		expect(result.balanceUsd).toBe(9.99996);
		expect(result.orders.map((o) => o.id)).toEqual(["o1", "o2"]);
		expect(result.spend).toEqual([
			{ month: "2026-08", tokens: 150, costUsd: 0.2 },
			{ month: "2026-09", tokens: 30, costUsd: 0.04 },
		]);
		expect(
			accountBilling(db, "acc_1", { now: NOW, prices: null }).spend[0]?.costUsd,
		).toBeNull();
	});

	test("an unknown account is empty and has no plan", () => {
		const { db } = setupAdminApp();
		expect(accountBilling(db, "nobody", { now: NOW, prices: null })).toEqual({
			standing: { ok: false, reason: "no_plan", since: null },
			subscription: null,
			balanceUsd: 0,
			orders: [],
			spend: [],
		});
	});

	test("GET /v1/admin/accounts/:accountId/billing is behind the admin key", async () => {
		const { app, db } = setupAdminApp();
		seedAccount(db);
		const body = await json(await app.handle(admin("/accounts/acc_1/billing")));
		expect(body.standing.ok).toBe(true);
		const denied = await app.handle(
			new Request("http://localhost/v1/admin/accounts/acc_1/billing"),
		);
		expect(denied.status).toBe(401);
	});
});
