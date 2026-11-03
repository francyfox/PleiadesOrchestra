import { describe, expect, test } from "bun:test";
import {
	createWebChannel,
	updateChannel,
} from "../channels/channels.service.ts";
import { creditLedger, subscriptions } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { REQUEST_HOLD_MICRO as HOLD } from "../ledger/ledger.service.ts";
import { ChannelDirectory } from "./channel-directory.ts";

function setup() {
	const db = testDb();
	const { channel, secretKey } = createWebChannel(
		db,
		{
			slug: "shop",
			name: "Shop",
			accessMode: "open",
			allowedOrigins: ["https://shop.example"],
		},
		1,
	);
	return { db, directory: new ChannelDirectory(db), channel, secretKey };
}

describe("ChannelDirectory", () => {
	test("finds channels by slug, id and publishable key", () => {
		const { directory, channel } = setup();
		expect(directory.bySlug("shop")?.id).toBe(channel.id);
		expect(directory.byId(channel.id)?.slug).toBe("shop");
		expect(
			directory.byPublishableKey(channel.publishableKey as string)?.id,
		).toBe(channel.id);
		expect(directory.bySlug("nope")).toBeUndefined();
	});

	test("only web channels are found by publishable key", () => {
		const { directory } = setup();
		expect(directory.byPublishableKey("")).toBeUndefined();
		expect(directory.bySlug("telegram")?.kind).toBe("telegram");
	});

	test("isWebOrigin is true only for enabled web channels", () => {
		const { db, directory, channel } = setup();
		expect(directory.isWebOrigin("https://shop.example")).toBe(true);
		expect(directory.isWebOrigin("https://evil.example")).toBe(false);

		updateChannel(db, channel.id, { disabled: true }, 2);
		directory.invalidate();
		expect(directory.isWebOrigin("https://shop.example")).toBe(false);
	});

	test("serves a stale view until invalidated", () => {
		const { db, directory, channel } = setup();
		directory.bySlug("shop");
		updateChannel(db, channel.id, { name: "Renamed" }, 2);
		expect(directory.bySlug("shop")?.name).toBe("Shop");
		directory.invalidate();
		expect(directory.bySlug("shop")?.name).toBe("Renamed");
	});
});

describe("ChannelDirectory.suspension", () => {
	const NOW = 1_000_000;
	function owned() {
		const db = testDb();
		const clock = { now: NOW };
		const directory = new ChannelDirectory(db, () => clock.now);
		const { channel } = createWebChannel(
			db,
			{
				slug: "owned",
				name: "Owned",
				accessMode: "open",
				allowedOrigins: [],
				ownerId: "acc_1",
			},
			1,
		);
		const plan = (status: string, currentPeriodEnd: number | null) =>
			db
				.insert(subscriptions)
				.values({
					id: "sub_1",
					accountId: "acc_1",
					customerId: "cus_1",
					status,
					currentPeriodEnd,
					cancelAtPeriodEnd: false,
					updatedAt: 1,
				})
				.run();
		let refs = 0;
		const ledger = (amount: number) =>
			db
				.insert(creditLedger)
				.values({
					accountId: "acc_1",
					amount,
					reason: "usage",
					ref: String(refs++),
					createdAt: 1,
				})
				.run();
		return { db, clock, directory, channel, plan, ledger };
	}

	test("an owner without a plan is suspended; staff channels never are", () => {
		const { directory, channel } = owned();
		expect(directory.suspension(channel)).toEqual({
			reason: "no_plan",
			since: null,
		});
		expect(directory.suspension({ ownerId: null })).toBeNull();
	});

	test("an active plan with balance serves", () => {
		const { directory, channel, plan, ledger } = owned();
		plan("active", NOW + 10);
		ledger(5 * HOLD);
		expect(directory.suspension(channel)).toBeNull();
	});

	test("a canceled plan past its period end keeps serving while the balance lasts", () => {
		const { directory, channel, plan, ledger, clock } = owned();
		plan("canceled", NOW + 10);
		ledger(5 * HOLD);
		clock.now = NOW + 10;
		expect(directory.suspension(channel)).toBeNull();
	});

	test("refreshStanding unblocks after a top-up and blocks after a debit crossing zero", () => {
		const { directory, channel, plan, ledger } = owned();
		plan("active", null);
		expect(directory.suspension(channel)?.reason).toBe("no_balance");
		ledger(5 * HOLD);
		expect(directory.suspension(channel)?.reason).toBe("no_balance");
		directory.refreshStanding("acc_1");
		expect(directory.suspension(channel)).toBeNull();
		ledger(-6 * HOLD);
		expect(directory.suspension(channel)).toBeNull();
		directory.refreshStanding("acc_1");
		expect(directory.suspension(channel)?.reason).toBe("no_balance");
	});

	test("reserve: concurrent requests see each other's holds; release and expiry free them", () => {
		const { directory, channel, ledger, clock } = owned();
		ledger(2 * HOLD);
		const first = directory.reserve(channel);
		const second = directory.reserve(channel);
		expect(first).toBeFunction();
		expect(second).toBeFunction();
		// Balance 2 holds, 2 in flight: a third request would overspend.
		expect(directory.reserve(channel)).toBeNull();
		first?.();
		first?.(); // releasing twice frees one hold only
		expect(directory.reserve(channel)).toBeFunction();
		expect(directory.reserve(channel)).toBeNull();
		// A hold whose stream never ended (crash, lost cancel) lapses.
		clock.now += 11 * 60_000;
		expect(directory.reserve(channel)).toBeFunction();
	});

	test("reserve: below one hold is refused; staff channels always pass", () => {
		const { directory, channel, ledger } = owned();
		ledger(HOLD - 1);
		expect(directory.reserve(channel)).toBeNull();
		expect(directory.suspension(channel)?.reason).toBe("no_plan");
		expect(directory.reserve({ ownerId: null })).toBeFunction();
	});
});
