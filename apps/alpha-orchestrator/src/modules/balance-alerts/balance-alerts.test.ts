import { expect, test } from "bun:test";
import { REQUEST_HOLD_NANO } from "../ledger/ledger.service.ts";
import type { WebhookEvent } from "../webhooks/webhooks.types.ts";
import { createBalanceAlerts } from "./balance-alerts.service.ts";

const TR = 1_000_000_000;

function setup(lowThresholdTr = 1) {
	let balance = 5 * TR;
	const events: string[] = [];
	const alerts = createBalanceAlerts({
		balanceOf: () => balance,
		channelsOf: () => ["ch1"],
		emit: ((event: WebhookEvent) => {
			events.push(event);
		}) as never,
		lowThresholdTr,
	});
	const debit = (to: number) => {
		balance = to;
		alerts.check("acc");
	};
	return { debit, events };
}

test("low fires once when the balance crosses the threshold, not while it stays below", () => {
	const { debit, events } = setup();
	debit(2 * TR);
	expect(events).toEqual([]);
	debit(0.9 * TR);
	debit(0.8 * TR);
	debit(0.5 * TR);
	expect(events).toEqual(["balance.low"]);
});

test("low re-arms after the balance rises back above the threshold", () => {
	const { debit, events } = setup();
	debit(0.9 * TR);
	debit(3 * TR); // topped up
	debit(2 * TR);
	debit(0.5 * TR);
	expect(events).toEqual(["balance.low", "balance.low"]);
});

test("depleted fires once when the balance no longer covers a request, after low", () => {
	const { debit, events } = setup();
	debit(0.5 * TR);
	debit(REQUEST_HOLD_NANO - 1);
	debit(-TR);
	expect(events).toEqual(["balance.low", "balance.depleted"]);
});

test("one debit that jumps over both lines fires both; depleted carries the channels", () => {
	const payloads: unknown[] = [];
	const alerts = createBalanceAlerts({
		balanceOf: () => -TR,
		channelsOf: () => ["ch1", "ch2"],
		emit: ((event: string, data: unknown) =>
			payloads.push([event, data])) as never,
		lowThresholdTr: 1,
	});
	alerts.check("acc");
	expect(payloads).toEqual([
		["balance.low", { accountId: "acc", balanceUsd: -1, thresholdUsd: 1 }],
		[
			"balance.depleted",
			{ accountId: "acc", balanceUsd: -1, channels: ["ch1", "ch2"] },
		],
	]);
});
