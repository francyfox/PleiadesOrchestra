import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
	BlockedIpForm,
	CreateBlockedIpInput,
	CustomerBlockedIpForm,
	TopUpForm,
} from "./forms.ts";

const block = { ip: "1.2.3.4", reason: "spam", expiresInHours: 24 };

test("the blocked-IP route takes any hours; the dialog wants 1 or more", () => {
	const fraction = { ...block, expiresInHours: 0 };
	expect(Value.Check(CreateBlockedIpInput, fraction)).toBe(true);
	expect(Value.Check(BlockedIpForm, fraction)).toBe(false);
});

test("a customer must pick a channel, staff may leave it out", () => {
	expect(Value.Check(BlockedIpForm, block)).toBe(true);
	expect(Value.Check(CustomerBlockedIpForm, block)).toBe(false);
	expect(Value.Check(CustomerBlockedIpForm, { ...block, channelId: "c" })).toBe(
		true,
	);
});

test("a top-up is whole USD 1..10000", () => {
	const topUp = (amountUsd: number) =>
		Value.Check(TopUpForm, { kind: "credits", amountUsd });
	expect([topUp(1), topUp(10_000)]).toEqual([true, true]);
	expect([topUp(0), topUp(10_001), topUp(1.5)]).toEqual([false, false, false]);
});
