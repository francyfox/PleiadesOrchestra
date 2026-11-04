import { describe, expect, test } from "bun:test";
import { REQUEST_HOLD_NANO as HOLD } from "../ledger/ledger.service.ts";
import { accountStanding, type PlanFields } from "./standing.service.ts";

const NOW = 1_000_000;
const plan = (overrides: Partial<PlanFields> = {}): PlanFields => ({
	status: "active",
	currentPeriodEnd: NOW + 1000,
	...overrides,
});

describe("accountStanding", () => {
	test("a balance of at least one request hold runs the channels with or without a plan", () => {
		for (const subscription of [
			plan(),
			plan({ status: "canceled", currentPeriodEnd: NOW - 1 }),
			plan({ status: "canceled", endedAt: NOW - 1 }),
			null,
		]) {
			expect(accountStanding(subscription, HOLD, NOW)).toEqual({
				ok: true,
				until: null,
			});
		}
	});

	test("below one hold, a running plan is no_balance", () => {
		for (const balance of [HOLD - 1, 0, -1]) {
			for (const status of ["active", "trialing"]) {
				expect(accountStanding(plan({ status }), balance, NOW)).toEqual({
					ok: false,
					reason: "no_balance",
					since: null,
				});
			}
		}
		// Canceled but still inside the paid period: the plan is in effect.
		expect(accountStanding(plan({ status: "canceled" }), 0, NOW)).toMatchObject(
			{ reason: "no_balance" },
		);
	});

	test("at zero, an ended plan is plan_expired from its end; a revoke ends it before the period", () => {
		expect(
			accountStanding(
				plan({ status: "canceled", currentPeriodEnd: NOW }),
				0,
				NOW,
			),
		).toEqual({ ok: false, reason: "plan_expired", since: NOW });
		expect(
			accountStanding(plan({ status: "canceled", endedAt: NOW - 5 }), 0, NOW),
		).toEqual({ ok: false, reason: "plan_expired", since: NOW - 5 });
		expect(
			accountStanding(
				plan({ status: "past_due", currentPeriodEnd: null }),
				0,
				NOW,
			),
		).toEqual({ ok: false, reason: "plan_expired", since: null });
	});

	test("at zero without any plan is no_plan", () => {
		expect(accountStanding(null, 0, NOW)).toEqual({
			ok: false,
			reason: "no_plan",
			since: null,
		});
	});
});
