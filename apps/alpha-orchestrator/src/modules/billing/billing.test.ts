import { describe, expect, test } from "bun:test";
import { createApp } from "../../app.ts";
import { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { subscriptions } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { agent, decisionAgent, NOW } from "../http/http.testing.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import {
	subscriptionData,
	WEBHOOK_SECRET,
	webhookRequest,
} from "./billing.testing.ts";

const NOW_SECONDS = Math.floor(NOW / 1000);

function setup(webhookSecret: string | undefined = WEBHOOK_SECRET) {
	const db = testDb();
	const app = createApp({
		agent,
		decisionAgent,
		apiKey: "transport-key",
		adminApiKey: "admin-key",
		maxChunkChars: 100,
		db,
		channels: new ChannelDirectory(db),
		runs: new RunBinding(),
		ipHashSalt: "salt",
		now: () => NOW,
		billing: webhookSecret ? { webhookSecret } : undefined,
	});
	return { db, app };
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
				channelId: null,
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

	test("an older event after a newer one leaves the newer state; a manual channel link survives updates", async () => {
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
		db.update(subscriptions).set({ channelId: "ch_cli" }).run();
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
			channelId: "ch_cli",
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
			channelId: "ch_cli",
		});
	});

	test("order.paid and unknown events are acknowledged without a subscription row", async () => {
		const { app, db } = setup();
		const response = await app.handle(
			webhookRequest({
				type: "order.paid",
				data: { id: "ord_1", total_amount: 2000 },
				timestampSeconds: NOW_SECONDS,
			}),
		);
		expect(response.status).toBe(200);
		expect(rows(db)).toEqual([]);
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
