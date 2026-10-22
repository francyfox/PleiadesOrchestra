import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { isEmail } from "../modules/admin-policy/admin-policy.service.ts";
import {
	AgentPick,
	IntentVerdictInput,
	MIN_PASSWORD,
	ProviderForm,
	ProviderInput,
	ProviderModel,
	ResetForm,
	UserRegisterForm,
} from "./forms.ts";

const model = { id: "m", name: "M", types: ["language"], extraBody: {} };

test("ProviderModel takes a valid body and refuses empty types", () => {
	expect(Value.Check(ProviderModel, model)).toBe(true);
	expect(Value.Check(ProviderModel, { ...model, types: [] })).toBe(false);
});

test("ProviderInput wants an http(s) base URL", () => {
	expect(Value.Check(ProviderInput, { name: "P", baseUrl: "https://x" })).toBe(
		true,
	);
	expect(Value.Check(ProviderInput, { name: "P", baseUrl: "x" })).toBe(false);
});

test("AgentPick needs both provider and model", () => {
	expect(Value.Check(AgentPick, { provider: "p", model: "m" })).toBe(true);
	expect(Value.Check(AgentPick, { provider: "", model: "m" })).toBe(false);
});

test("IntentVerdictInput takes a status or an intent, nothing required", () => {
	expect(Value.Check(IntentVerdictInput, {})).toBe(true);
	expect(Value.Check(IntentVerdictInput, { status: "approved" })).toBe(true);
	expect(Value.Check(IntentVerdictInput, { intent: "search" })).toBe(true);
	expect(Value.Check(IntentVerdictInput, { intent: "nope" })).toBe(false);
});

test("ProviderForm needs the id too", () => {
	const body = { name: "P", baseUrl: "http://x" };
	expect(Value.Check(ProviderForm, { id: "p", ...body })).toBe(true);
	expect(Value.Check(ProviderForm, body)).toBe(false);
});

test("UserRegisterForm: email rule is the server isEmail, password has the server minimum", () => {
	const ok = { email: "a@b", password: "x".repeat(MIN_PASSWORD) };
	expect(Value.Check(UserRegisterForm, ok)).toBe(true);
	for (const email of ["a@b", "a b@c", "ab", "a@@b"])
		expect(Value.Check(UserRegisterForm, { ...ok, email })).toBe(
			isEmail(email),
		);
	expect(
		Value.Check(UserRegisterForm, {
			...ok,
			password: "x".repeat(MIN_PASSWORD - 1),
		}),
	).toBe(false);
	expect(Value.Check(ResetForm, { token: "t", password: "short" })).toBe(false);
});
