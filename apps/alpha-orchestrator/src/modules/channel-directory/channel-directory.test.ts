import { describe, expect, test } from "bun:test";
import {
	createWebChannel,
	updateChannel,
} from "../channels/channels.service.ts";
import { creditLedger, subscriptions } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import {
	balanceNano,
	REQUEST_HOLD_NANO as HOLD,
} from "../ledger/ledger.service.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import { SqliteUsageRecorder } from "../usage-recorder/usage-recorder.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
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

describe("reserve-then-settle with the real usage recorder", () => {
	// 1 TR per 1e9 tokens x 1e6 tokens... simply: 1000 input tokens at $1e-6 = 1 HOLD (0.001 TR).
	const prices = () =>
		new Map([["paid/model", { input: 0.000001, output: 0, cacheRead: 0 }]]);
	const TOKENS_PER_HOLD = 1000;

	function setup(balance: number) {
		const db = testDb();
		db.$client
			.query("UPDATE channels SET owner_id = 'acc_1' WHERE id = 'ch_telegram'")
			.run();
		const directory = new ChannelDirectory(db);
		const visitor = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"42",
			undefined,
			1,
		);
		const recorder = new SqliteUsageRecorder(db, new RunBinding(), {
			prices,
			onDebited: (id) => directory.refreshStanding(id),
		});
		const credit = (amount: number) =>
			db
				.insert(creditLedger)
				.values({
					accountId: "acc_1",
					amount,
					reason: "adjustment" as const,
					ref: `top-up-${amount}-${Math.random()}`,
					createdAt: 1,
				})
				.run();
		credit(balance);
		/** One request as the routes run it: reserve, model call(s), debit by flush, then release. */
		const request = async (holds: number, work = 0) => {
			const release = directory.reserve({ ownerId: "acc_1" });
			if (!release) return false;
			await Bun.sleep(work);
			recorder.record({
				threadId: "t",
				userId: visitor.id,
				kind: "generate",
				provider: "p",
				model: "paid/model",
				inputTokens: holds * TOKENS_PER_HOLD,
				outputTokens: 0,
				latencyMs: 1,
				ok: true,
				at: 1000,
			});
			recorder.flush();
			release();
			return true;
		};
		return { db, directory, credit, request };
	}

	test("staggered parallel requests never spend more than the balance", async () => {
		const { db, request } = setup(3 * HOLD);
		// A new request every millisecond for 40 ms, each running 3 ms: some always start while another is finishing.
		const served = await Promise.all(
			Array.from({ length: 40 }, async (_, i) => {
				await Bun.sleep(i);
				return request(1, 3);
			}),
		);
		expect(served.filter(Boolean)).toHaveLength(3);
		expect(balanceNano(db, "acc_1")).toBe(0);
	});

	test("requests started together share the balance: only as many as it covers pass", async () => {
		const { db, request } = setup(2 * HOLD);
		const served = await Promise.all(
			Array.from({ length: 10 }, () => request(1, 5)),
		);
		expect(served.filter(Boolean)).toHaveLength(2);
		expect(balanceNano(db, "acc_1")).toBe(0);
	});

	test("one request costing more than its hold overdraws; the next top-up pays the debt first", async () => {
		const { db, directory, credit, request } = setup(HOLD);
		expect(await request(3)).toBe(true);
		expect(balanceNano(db, "acc_1")).toBe(-2 * HOLD);
		// Refused while in debt, and the standing was refreshed by the debit.
		expect(directory.suspension({ ownerId: "acc_1" })?.reason).toBe("no_plan");
		expect(directory.reserve({ ownerId: "acc_1" })).toBeNull();
		// A top-up smaller than the debt keeps it blocked.
		credit(2 * HOLD);
		directory.refreshStanding("acc_1");
		expect(directory.reserve({ ownerId: "acc_1" })).toBeNull();
		// Debt cleared plus one hold: it serves again, exactly once.
		credit(HOLD);
		const first = directory.reserve({ ownerId: "acc_1" });
		expect(first).toBeFunction();
		expect(directory.reserve({ ownerId: "acc_1" })).toBeNull();
	});
});
