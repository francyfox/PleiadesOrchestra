import { describe, expect, test } from "bun:test";
import { createApp } from "../../app.ts";
import { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { createWebChannel } from "../channels/channels.service.ts";
import { orders, subscriptions } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import {
	admin,
	agent,
	decisionAgent,
	json,
	NOW,
} from "../http/http.testing.ts";
import { balanceMicro } from "../ledger/ledger.service.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import { orderData, subscriptionData } from "./billing.testing.ts";

function setup() {
	const db = testDb();
	const directory = new ChannelDirectory(db, () => NOW);
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
		now: () => NOW,
	});
	const sync = (body: unknown) =>
		app.handle(
			admin("/billing/sync", { method: "POST", body, key: "admin-key" }),
		);
	return { db, app, directory, sync };
}

describe("POST /v1/admin/billing/sync", () => {
	test("applies Polar's subscriptions and paid orders like webhooks; a second run changes nothing", async () => {
		const { db, sync } = setup();
		const body = {
			subscriptions: [subscriptionData()],
			orders: [
				orderData({ paid: true }),
				// Not paid yet: must not top anything up.
				orderData({ id: "ord_open", status: "pending", paid: false }),
			],
		};
		expect(await json(await sync(body))).toEqual({
			applied: 2,
			unchanged: 0,
			skipped: 1,
		});
		expect(db.select().from(subscriptions).all()).toHaveLength(1);
		expect(db.select().from(orders).all()).toHaveLength(1);
		expect(balanceMicro(db, "acc_1")).toBe(10_000_000);

		expect(await json(await sync(body))).toEqual({
			applied: 0,
			unchanged: 2,
			skipped: 1,
		});
		expect(balanceMicro(db, "acc_1")).toBe(10_000_000);
	});

	test("unpauses the owner's channel at once, also when the account comes from metadata", async () => {
		const { db, directory, sync } = setup();
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
		const reused = { id: "cus_1", external_id: null };
		const metadata = { account_id: "acc_1" };
		await sync({
			subscriptions: [],
			orders: [orderData({ paid: true, customer: reused, metadata })],
		});
		expect(directory.suspension(channel)).toBeNull();
	});

	test("needs the admin key", async () => {
		const { app } = setup();
		const response = await app.handle(
			admin("/billing/sync", {
				method: "POST",
				body: { subscriptions: [], orders: [] },
				key: "wrong",
			}),
		);
		expect(response.status).toBe(401);
	});
});
