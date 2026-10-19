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

	test("a channel is linked and unlinked by hand; the list names it", async () => {
		const { app, db } = setupAdminApp();
		seed(db, "s1");
		const linked = await json(
			await app.handle(
				admin("/subscriptions/s1/channel", {
					method: "PUT",
					body: { channelId: "ch_cli" },
				}),
			),
		);
		expect(linked).toMatchObject({
			channelId: "ch_cli",
			channelName: expect.any(String),
		});
		const unlinked = await json(
			await app.handle(
				admin("/subscriptions/s1/channel", {
					method: "PUT",
					body: { channelId: null },
				}),
			),
		);
		expect(unlinked.channelId).toBeNull();
	});

	test("unknown subscription or channel is refused", async () => {
		const { app, db } = setupAdminApp();
		seed(db, "s1");
		const put = (id: string, channelId: string) =>
			app.handle(
				admin(`/subscriptions/${id}/channel`, {
					method: "PUT",
					body: { channelId },
				}),
			);
		expect((await put("nope", "ch_cli")).status).toBe(404);
		expect((await put("s1", "ch_nope")).status).toBe(400);
	});
});
