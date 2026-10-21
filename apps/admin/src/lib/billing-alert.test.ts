import { expect, test } from "bun:test";
import type { StandingView } from "#lib/api-types.js";
import { standingAlert } from "./billing-alert";

const standing = (patch: Partial<StandingView>): StandingView => ({
	ok: true,
	reason: null,
	since: null,
	until: null,
	balanceUsd: 5,
	warn: false,
	...patch,
});

test("a healthy standing has no alert", () => {
	expect(standingAlert(standing({}))).toBeNull();
});

test("a missing plan or an expired one is a red 'renew the plan'", () => {
	for (const reason of ["no_plan", "plan_expired"] as const) {
		expect(standingAlert(standing({ ok: false, reason }))).toEqual({
			tone: "red",
			key: "renewPlan",
		});
	}
});

test("no balance is a red 'top up'", () => {
	expect(standingAlert(standing({ ok: false, reason: "no_balance" }))).toEqual({
		tone: "red",
		key: "topUp",
	});
});

test("a warning is yellow: low balance first, else the plan ending", () => {
	expect(standingAlert(standing({ warn: true, balanceUsd: 0.5 }))).toEqual({
		tone: "yellow",
		key: "lowBalance",
	});
	expect(standingAlert(standing({ warn: true, balanceUsd: 20 }))).toEqual({
		tone: "yellow",
		key: "planEnding",
	});
});

test("red wins over a warning", () => {
	expect(
		standingAlert(standing({ ok: false, reason: "no_plan", warn: true })),
	).toEqual({ tone: "red", key: "renewPlan" });
});
