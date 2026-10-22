import { describe, expect, test } from "bun:test";
import { AgentPick, ProviderForm, ProviderModel } from "admin-api/forms";
import { parseForm, validateForm } from "./field-errors.ts";

const form = (fields: Record<string, string | string[]>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields))
		for (const v of [value].flat()) data.append(name, v);
	return data;
};
const model = { id: "m", name: "M", types: ["language"] };

describe("validateForm", () => {
	test("a valid form has no errors", () => {
		expect(validateForm(ProviderModel, form(model))).toBeUndefined();
	});

	test("missing, empty and empty-array fields are required", () => {
		expect(
			validateForm(ProviderModel, form({ ...model, name: " ", types: [] })),
		).toEqual({
			name: { code: "required" },
			types: { code: "required" },
		});
	});

	test("limits and formats keep their kind", () => {
		const errors = validateForm(
			ProviderModel,
			form({
				...model,
				id: "x".repeat(201),
				temperature: "3",
				extraBody: "[1]",
			}),
		);
		expect(errors?.id).toEqual({ code: "too_long", limit: 200 });
		expect(errors?.temperature).toEqual({ code: "too_big", limit: 2 });
		expect(errors?.extraBody).toEqual({ code: "invalid" });
		const provider = validateForm(
			ProviderForm,
			form({ id: "p", name: "P", baseUrl: "ftp://x", decisionsUrl: "nope" }),
		);
		expect(provider?.baseUrl).toEqual({ code: "pattern" });
		expect(provider?.decisionsUrl).toEqual({ code: "pattern" });
	});

	test("an empty optional field is left out, not an error", () => {
		expect(
			validateForm(
				ProviderForm,
				form({ id: "p", name: "P", baseUrl: "http://x", decisionsUrl: "" }),
			),
		).toBeUndefined();
	});
});

describe("parseForm", () => {
	test("returns the typed body: numbers, JSON objects, empty optionals left out", () => {
		const result = parseForm(
			ProviderModel,
			form({
				...model,
				temperature: "0",
				reasoningEffort: "",
				extraBody: '{"provider":{"require_parameters":true}}',
			}),
		);
		expect(result).toEqual({
			ok: true,
			body: {
				id: "m",
				name: "M",
				types: ["language"],
				temperature: 0,
				extraBody: { provider: { require_parameters: true } },
			},
		});
	});

	test("an empty extra-body field is {}; no types is refused", () => {
		expect(
			parseForm(ProviderModel, form({ ...model, extraBody: "" })),
		).toMatchObject({ ok: true, body: { extraBody: {} } });
		expect(parseForm(ProviderModel, form({ ...model, types: [] }))).toEqual({
			ok: false,
			errors: { types: { code: "required" } },
		});
	});

	test("a field override replaces the default reading", () => {
		const result = parseForm(ProviderModel, form({ ...model, pick: "a\tb" }), {
			name: (f: FormData) => String(f.get("pick")).split("\t")[1],
		});
		expect(result).toMatchObject({ ok: true, body: { name: "b" } });
	});
});

describe("agent pick", () => {
	const pick = {
		provider: (f: FormData) => String(f.get("model")).split("\t")[0],
		model: (f: FormData) => String(f.get("model")).split("\t")[1] ?? "",
	};

	test("a select value splits into provider and model id", () => {
		const result = parseForm(AgentPick, form({ model: "p\tqwen/q:1b" }), pick);
		expect(result).toEqual({
			ok: true,
			body: { provider: "p", model: "qwen/q:1b" },
		});
	});

	test("an empty select is required", () => {
		expect(validateForm(AgentPick, form({ model: "" }), pick)?.model).toEqual({
			code: "required",
		});
	});
});
