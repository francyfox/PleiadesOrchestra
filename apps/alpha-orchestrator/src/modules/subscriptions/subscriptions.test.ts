import { describe, expect, test } from "bun:test";
import { subscriptions } from "../database/database.schema.ts";
import { admin, DAY, json, NOW, setupAdminApp } from "../http/http.testing.ts";

function seed(
	db: ReturnType<typeof setupAdminApp>["db"],
	id: string,
	fields: Partial<typeof subscriptions.$inferInsert> = {},
) {
	db.insert(subscriptions)
		.values({
			id,
			accountId: `acc_${id}`,
			customerId: `cus_${id}`,
			customerEmail: `${id}@shop.example`,
			productName: "Cloud",
			status: "active",
			startedAt: NOW - 20 * DAY,
			currentPeriodEnd: NOW + 20 * DAY,
			cancelAtPeriodEnd: false,
			updatedAt: NOW,
			...fields,
		})
		.run();
}

describe("admin subscriptions", () => {
	test("status is derived and the list puts plans expiring within 7 days first, ended last", async () => {
		const { app, db } = setupAdminApp();
		seed(db, "later", { currentPeriodEnd: NOW + 20 * DAY });
		seed(db, "ended", {
			status: "canceled",
			endedAt: NOW - DAY,
			currentPeriodEnd: NOW - DAY,
		});
		seed(db, "soon", {
			cancelAtPeriodEnd: true,
			currentPeriodEnd: NOW + 3 * DAY,
		});
		seed(db, "due", { status: "past_due", currentPeriodEnd: NOW + 10 * DAY });

		const { items } = await json(await app.handle(admin("/subscriptions")));
		expect(
			items.map((s: { id: string; status: string }) => [s.id, s.status]),
		).toEqual([
			["soon", "canceling"],
			["due", "past_due"],
			["later", "active"],
			["ended", "ended"],
		]);

		const only = await json(
			await app.handle(admin("/subscriptions?status=past_due")),
		);
		expect(only.items.map((s: { id: string }) => s.id)).toEqual(["due"]);
	});

	test("accountId filters the list", async () => {
		const { app, db } = setupAdminApp();
		seed(db, "s1");
		seed(db, "s2");
		const { items } = await json(
			await app.handle(admin("/subscriptions?accountId=acc_s2")),
		);
		expect(items.map((s: { id: string }) => s.id)).toEqual(["s2"]);
		expect(items[0].accountId).toBe("acc_s2");
	});
});
