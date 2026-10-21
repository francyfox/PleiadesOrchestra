import { describe, expect, test } from "bun:test";
import { accountStanding, type PlanFields } from "./standing.service.ts";

const NOW = 1_000_000;
const plan = (overrides: Partial<PlanFields> = {}): PlanFields => ({
	status: "active",
	currentPeriodEnd: NOW + 1000,
	...overrides,
});

describe("accountStanding", () => {
	test("active and trialing plans are in effect and need no expiry", () => {
		expect(accountStanding(plan(), 1, NOW)).toEqual({ ok: true, until: null });
		expect(accountStanding(plan({ status: "trialing" }), 1, NOW)).toEqual({
			ok: true,
			until: null,
		});
	});

	test("a canceled or past_due plan runs to the end of its period", () => {
		for (const status of ["canceled", "past_due", "unpaid"]) {
			expect(accountStanding(plan({ status }), 1, NOW)).toEqual({
				ok: true,
				until: NOW + 1000,
			});
		}
	});

	test("the period ending exactly now is over", () => {
		expect(
			accountStanding(
				plan({ status: "canceled", currentPeriodEnd: NOW }),
				1,
				NOW,
			),
		).toEqual({ ok: false, reason: "plan_expired", since: NOW });
	});

	test("an inactive plan without a period end is expired", () => {
		expect(
			accountStanding(
				plan({ status: "past_due", currentPeriodEnd: null }),
				1,
				NOW,
			),
		).toEqual({ ok: false, reason: "plan_expired", since: null });
	});

	test("no subscription is no_plan", () => {
		expect(accountStanding(null, 1, NOW)).toEqual({
			ok: false,
			reason: "no_plan",
			since: null,
		});
	});

	test("balance must be above zero: 0 and negative are no_balance", () => {
		for (const balance of [0, -1]) {
			expect(accountStanding(plan(), balance, NOW)).toEqual({
				ok: false,
				reason: "no_balance",
				since: null,
			});
		}
	});

	test("a missing plan wins over a missing balance", () => {
		expect(accountStanding(null, 0, NOW)).toMatchObject({ reason: "no_plan" });
	});
});
