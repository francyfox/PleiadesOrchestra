import { describe, expect, test } from "bun:test";
import { createApp } from "../../app.ts";
import { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { createWebChannel } from "../channels/channels.service.ts";
import {
	creditLedger,
	orders,
	subscriptions,
} from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { agent, decisionAgent, NOW } from "../http/http.testing.ts";
import { balanceMicro } from "../ledger/ledger.service.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import {
	orderData,
	subscriptionData,
	WEBHOOK_SECRET,
	webhookRequest,
} from "./billing.testing.ts";

const NOW_SECONDS = Math.floor(NOW / 1000);

function setup(
	webhookSecret: string | undefined = WEBHOOK_SECRET,
	now: () => number = () => NOW,
) {
	const db = testDb();
	const directory = new ChannelDirectory(db, now);
	const app = createApp({
		agent,
		decisionAgent,
		apiKey: "transport-key",
		adminApiKey: "admin-key",
		maxChunkChars: 100,
		db,
		channels: directory,
		runs: new RunBinding(),
		ipHashSalt: "salt",
		now,
		billing: webhookSecret
			? { webhookSecret, creditsProductId: "prod_credits" }
			: undefined,
	});
	return { db, app, directory };
}

const rows = (db: ReturnType<typeof testDb>) =>
	db.select().from(subscriptions).all();

describe("POST /v1/billing/polar", () => {
	test("a validly signed subscription event is stored, without any bearer key", async () => {
		const { app, db } = setup();
		const response = await app.handle(
			webhookRequest({
				type: "subscription.active",
				timestampSeconds: NOW_SECONDS,
			}),
		);
		expect(response.status).toBe(200);
		expect(rows(db)).toEqual([
			expect.objectContaining({
				id: "sub_1",
				customerEmail: "owner@shop.example",
				productName: "Cloud",
				status: "active",
				currentPeriodEnd: Date.parse("2026-11-01T00:00:00Z"),
				cancelAtPeriodEnd: false,
				accountId: "acc_1",
			}),
		]);
	});

	test("a tampered body, a wrong secret and a stale or future timestamp are rejected", async () => {
		const { app, db } = setup();
		const attempts = [
			webhookRequest({
				type: "subscription.active",
				timestampSeconds: NOW_SECONDS,
				tamper: true,
			}),
			webhookRequest({
				type: "subscription.active",
				timestampSeconds: NOW_SECONDS,
				secret: `whsec_${Buffer.from("other").toString("base64")}`,
			}),
			webhookRequest({
				type: "subscription.active",
				timestampSeconds: NOW_SECONDS - 301,
			}),
			webhookRequest({
				type: "subscription.active",
				timestampSeconds: NOW_SECONDS + 301,
			}),
		];
		for (const attempt of attempts) {
			expect((await app.handle(attempt)).status).toBe(401);
		}
		expect(rows(db)).toEqual([]);
	});

	test("a timestamp just inside five minutes passes", async () => {
		const { app } = setup();
		const response = await app.handle(
			webhookRequest({
				type: "subscription.active",
				timestampSeconds: NOW_SECONDS - 299,
			}),
		);
		expect(response.status).toBe(200);
	});

	test("a replayed webhook-id is acknowledged and not applied twice", async () => {
		const { app, db } = setup();
		const first = webhookRequest({
			type: "subscription.active",
			timestampSeconds: NOW_SECONDS,
			id: "msg_a",
		});
		await app.handle(first);
		// Same id, different content (a different event that happens to reuse the id): ignored.
		const replay = webhookRequest({
			type: "subscription.revoked",
			timestampSeconds: NOW_SECONDS,
			id: "msg_a",
			data: subscriptionData({
				status: "canceled",
				modified_at: "2026-10-02T00:00:00Z",
			}),
		});
		const response = await app.handle(replay);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ duplicate: true });
		expect(rows(db)[0]?.status).toBe("active");
	});

	test("an older event after a newer one leaves the newer state", async () => {
		const { app, db } = setup();
		const send = (id: string, data: unknown, type = "subscription.updated") =>
			app.handle(
				webhookRequest({ type, id, data, timestampSeconds: NOW_SECONDS }),
			);
		await send(
			"m1",
			subscriptionData({
				modified_at: "2026-10-05T00:00:00Z",
				cancel_at_period_end: true,
			}),
			"subscription.canceled",
		);
		// Older, delivered late.
		await send(
			"m2",
			subscriptionData({
				modified_at: "2026-10-03T00:00:00Z",
				cancel_at_period_end: false,
			}),
		);
		expect(rows(db)[0]).toMatchObject({
			cancelAtPeriodEnd: true,
		});
		// Newer wins and renews the period.
		await send(
			"m3",
			subscriptionData({
				modified_at: "2026-10-09T00:00:00Z",
				current_period_end: "2026-12-01T00:00:00Z",
			}),
			"subscription.cycled",
		);
		expect(rows(db)[0]).toMatchObject({
			cancelAtPeriodEnd: false,
			currentPeriodEnd: Date.parse("2026-12-01T00:00:00Z"),
		});
	});

	test("unknown events and events without an external_id are acknowledged without a row", async () => {
		const { app, db } = setup();
		const send = (type: string, data: unknown, id: string) =>
			app.handle(
				webhookRequest({ type, id, data, timestampSeconds: NOW_SECONDS }),
			);
		expect((await send("customer.created", { id: "cus_1" }, "m1")).status).toBe(
			200,
		);
		const anonymous = subscriptionData({ customer: { id: "cus_1" } });
		expect((await send("subscription.active", anonymous, "m2")).status).toBe(
			200,
		);
		expect(rows(db)).toEqual([]);
	});

	test("an existing Polar customer without external_id maps by the checkout's metadata.account_id", async () => {
		const { app, db } = setup();
		const send = (type: string, data: unknown, id: string) =>
			app.handle(
				webhookRequest({ type, id, data, timestampSeconds: NOW_SECONDS }),
			);
		// Polar reuses a customer with the same email and leaves its external_id empty.
		const reused = { id: "cus_1", external_id: null };
		const metadata = { account_id: "acc_1" };
		await send(
			"subscription.active",
			subscriptionData({ customer: reused, metadata }),
			"m1",
		);
		await send("order.paid", orderData({ customer: reused, metadata }), "m2");
		expect(rows(db)).toEqual([
			expect.objectContaining({ id: "sub_1", accountId: "acc_1" }),
		]);
		expect(db.select().from(orders).all()).toEqual([
			expect.objectContaining({ id: "ord_1", accountId: "acc_1" }),
		]);
	});

	describe("orders and the ledger", () => {
		const send = (
			app: ReturnType<typeof setup>["app"],
			type: string,
			data: unknown,
			id: string,
		) =>
			app.handle(
				webhookRequest({ type, id, data, timestampSeconds: NOW_SECONDS }),
			);

		test("a paid credits order tops the balance up once, however often it is delivered", async () => {
			const { app, db } = setup();
			await send(app, "order.paid", orderData(), "m1");
			await send(app, "order.paid", orderData(), "m1"); // replay of the webhook
			await send(app, "order.paid", orderData(), "m2"); // Polar sent it again as a new delivery
			expect(db.select().from(orders).all()).toEqual([
				expect.objectContaining({
					id: "ord_1",
					accountId: "acc_1",
					kind: "credits",
					amount: 1000,
					currency: "usd",
					status: "paid",
					refundedAmount: 0,
				}),
			]);
			expect(balanceMicro(db, "acc_1")).toBe(10_000_000);
			expect(db.select().from(creditLedger).all()).toHaveLength(1);
		});

		test("a refund takes back only the growth of the refunded amount", async () => {
			const { app, db } = setup();
			await send(app, "order.paid", orderData(), "m1");
			const refund = (amount: number, status: string, id: string) =>
				send(
					app,
					"order.refunded",
					orderData({ refunded_amount: amount, status }),
					id,
				);
			await refund(400, "partially_refunded", "m2");
			await refund(400, "partially_refunded", "m3");
			expect(balanceMicro(db, "acc_1")).toBe(6_000_000);
			await refund(1000, "refunded", "m4");
			expect(balanceMicro(db, "acc_1")).toBe(0);
			// A late order.paid with the pre-refund figures changes nothing.
			await send(app, "order.paid", orderData(), "m5");
			expect(balanceMicro(db, "acc_1")).toBe(0);
			expect(db.select().from(orders).get()).toMatchObject({
				status: "refunded",
				refundedAmount: 1000,
			});
		});

		test("a refund that arrives before the payment nets to the same balance", async () => {
			const { app, db } = setup();
			await send(
				app,
				"order.refunded",
				orderData({ refunded_amount: 1000, status: "refunded" }),
				"m1",
			);
			await send(app, "order.paid", orderData(), "m2");
			expect(balanceMicro(db, "acc_1")).toBe(0);
		});

		test("a plan order credits its amount like a top-up, and its refund takes it back", async () => {
			const { app, db } = setup();
			const planOrder = (overrides: Record<string, unknown> = {}) =>
				orderData({
					id: "ord_2",
					product_id: "prod_1",
					net_amount: 2000,
					...overrides,
				});
			await send(app, "order.paid", planOrder(), "m1");
			expect(db.select().from(orders).get()).toMatchObject({ kind: "plan" });
			expect(balanceMicro(db, "acc_1")).toBe(20_000_000);
			await send(
				app,
				"order.refunded",
				planOrder({ refunded_amount: 2000, status: "refunded" }),
				"m2",
			);
			expect(balanceMicro(db, "acc_1")).toBe(0);
		});

		test("an order without an amount is a 400", async () => {
			const { app } = setup();
			const response = await send(
				app,
				"order.paid",
				orderData({ net_amount: undefined }),
				"m1",
			);
			expect(response.status).toBe(400);
		});
	});

	test("a signed but malformed subscription payload is a 400 and is not remembered as handled", async () => {
		const { app } = setup();
		const bad = (id: string) =>
			webhookRequest({
				type: "subscription.active",
				id,
				data: { id: "sub_x" },
				timestampSeconds: NOW_SECONDS,
			});
		expect((await app.handle(bad("m1"))).status).toBe(400);
		expect((await app.handle(bad("m1"))).status).toBe(400);
	});

	test("without POLAR_WEBHOOK_SECRET the route does not exist", async () => {
		const { app } = setup("");
		const response = await app.handle(
			webhookRequest({
				type: "subscription.active",
				timestampSeconds: NOW_SECONDS,
			}),
		);
		expect(response.status).toBe(404);
	});

	test("a secret that is not whsec_-prefixed is used as its raw bytes (Polar's older signing)", async () => {
		const { app, db } = setup("polar_whs_plain");
		const key = "polar_whs_plain";
		const body = JSON.stringify({
			type: "subscription.active",
			data: subscriptionData(),
		});
		const { createHmac } = await import("node:crypto");
		const signature = createHmac("sha256", Buffer.from(key, "utf8"))
			.update(`m9.${NOW_SECONDS}.${body}`)
			.digest("base64");
		const response = await app.handle(
			new Request("http://localhost/v1/billing/polar", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"webhook-id": "m9",
					"webhook-timestamp": String(NOW_SECONDS),
					"webhook-signature": `v1,${signature}`,
				},
				body,
			}),
		);
		expect(response.status).toBe(200);
		expect(rows(db)).toHaveLength(1);
	});
});

describe("channel standing after a webhook", () => {
	test("a plan and a top-up unblock the owner's channel at once", async () => {
		const { app, db, directory } = setup();
		const { channel } = createWebChannel(
			db,
			{
				slug: "mine",
				name: "Mine",
				accessMode: "open",
				allowedOrigins: [],
				ownerId: "acc_1",
			},
			1,
		);
		expect(directory.suspension(channel)?.reason).toBe("no_plan");
		await app.handle(
			webhookRequest({
				type: "subscription.active",
				timestampSeconds: NOW_SECONDS,
			}),
		);
		expect(directory.suspension(channel)?.reason).toBe("no_balance");
		await app.handle(
			webhookRequest({
				type: "order.paid",
				id: "msg_2",
				data: orderData(),
				timestampSeconds: NOW_SECONDS,
			}),
		);
		expect(directory.suspension(channel)).toBeNull();
	});
});

describe("the payment cycle", () => {
	test("each paid month tops up the balance; a cancel keeps what is left; zero pauses with the reason", async () => {
		let clock = NOW;
		const { app, db, directory } = setup(WEBHOOK_SECRET, () => clock);
		const { channel } = createWebChannel(
			db,
			{
				slug: "mine",
				name: "Mine",
				accessMode: "open",
				allowedOrigins: [],
				ownerId: "acc_1",
			},
			1,
		);
		let message = 0;
		const send = async (type: string, data: unknown) => {
			const response = await app.handle(
				webhookRequest({
					type,
					data,
					id: `msg_${++message}`,
					timestampSeconds: Math.floor(clock / 1000),
				}),
			);
			expect(response.status).toBe(200);
		};
		const reason = () => directory.suspension(channel)?.reason ?? "ok";
		const month = (n: number, overrides: Record<string, unknown> = {}) =>
			orderData({
				id: `ord_${n}`,
				product_id: "prod_1",
				net_amount: 2000,
				...overrides,
			});

		expect(reason()).toBe("no_plan");
		await send("subscription.active", subscriptionData());
		await send("order.paid", month(1));
		expect(reason()).toBe("ok");
		expect(balanceMicro(db, "acc_1")).toBe(20_000_000);

		// Polar renews: the next period and the next order; the unspent month stays.
		clock = Date.parse("2026-11-01T01:00:00Z");
		await send(
			"subscription.updated",
			subscriptionData({
				current_period_start: "2026-11-01T00:00:00Z",
				current_period_end: "2026-12-01T00:00:00Z",
				modified_at: "2026-11-01T00:00:00Z",
			}),
		);
		await send("order.paid", month(2, { created_at: "2026-11-01T00:00:00Z" }));
		expect(balanceMicro(db, "acc_1")).toBe(40_000_000);

		// Canceled, then the period ends: the balance still runs the channels.
		clock = Date.parse("2026-12-01T00:00:00Z");
		await send(
			"subscription.revoked",
			subscriptionData({
				status: "canceled",
				current_period_end: "2026-12-01T00:00:00Z",
				ended_at: "2026-12-01T00:00:00Z",
				modified_at: "2026-12-01T00:00:00Z",
			}),
		);
		expect(reason()).toBe("ok");

		// Spent down to zero after the plan ended: paused as plan_expired.
		db.insert(creditLedger)
			.values({
				accountId: "acc_1",
				amount: -40_000_000,
				reason: "usage",
				ref: "x",
				createdAt: clock,
			})
			.run();
		directory.refreshStanding("acc_1");
		expect(reason()).toBe("plan_expired");
	});
});
