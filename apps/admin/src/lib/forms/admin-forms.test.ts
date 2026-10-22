import { expect, test } from "bun:test";
import {
	CreateAdminInput,
	CustomerBlockedIpForm,
	TopUpForm,
} from "admin-api/forms";
import { adminOverrides } from "../actions.ts";
import { parseForm } from "./field-errors.ts";

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.set(name, value);
	return data;
};

test("a blank admin name is sent as an empty string, a blank email is required", () => {
	const ok = parseForm(
		CreateAdminInput,
		form({ name: " ", email: "a@b.c" }),
		adminOverrides,
	);
	expect(ok).toEqual({ ok: true, body: { name: "", email: "a@b.c" } });
	const bad = parseForm(
		CreateAdminInput,
		form({ name: "x", email: " " }),
		adminOverrides,
	);
	expect(bad).toEqual({ ok: false, errors: { email: { code: "required" } } });
});

test("a top-up amount is whole USD 1..10000", () => {
	const amount = (value: string) =>
		parseForm(TopUpForm, form({ kind: "credits", amountUsd: value }));
	expect(amount("25")).toEqual({
		ok: true,
		body: { kind: "credits", amountUsd: 25 },
	});
	expect(amount("")).toMatchObject({
		ok: false,
		errors: { amountUsd: { code: "required" } },
	});
	expect(amount("0")).toMatchObject({
		errors: { amountUsd: { code: "too_small" } },
	});
	expect(amount("10001")).toMatchObject({
		errors: { amountUsd: { code: "too_big" } },
	});
});

test("a customer's block needs a channel", () => {
	const fields = { ip: "1.2.3.4", reason: "spam", expiresInHours: "24" };
	expect(
		parseForm(CustomerBlockedIpForm, form({ ...fields, channelId: "" })),
	).toMatchObject({
		errors: { channelId: { code: "required" } },
	});
});
