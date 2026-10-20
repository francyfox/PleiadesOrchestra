import { describe, expect, test } from "bun:test";
import { providerModelFromForm } from "./provider-model-form.ts";

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.set(name, value);
	return data;
};

describe("providerModelFromForm", () => {
	test("empty fields are left out; the name defaults to the id", () => {
		expect(
			providerModelFromForm(
				form({
					id: " qwen3:1.7b ",
					name: "",
					temperature: "",
					reasoningEffort: "",
				}),
			),
		).toEqual({ id: "qwen3:1.7b", name: "qwen3:1.7b", extraBody: {} });
	});

	test("filled fields are typed; 0 is a temperature", () => {
		expect(
			providerModelFromForm(
				form({
					id: "m",
					name: "M",
					temperature: "0",
					reasoningEffort: "none",
					extraBody: '{"provider":{"require_parameters":true}}',
				}),
			),
		).toEqual({
			id: "m",
			name: "M",
			temperature: 0,
			reasoningEffort: "none",
			extraBody: { provider: { require_parameters: true } },
		});
	});

	test("extra fields that are not a JSON object are refused", () => {
		expect(
			providerModelFromForm(form({ id: "m", extraBody: "[1]" })),
		).toBeNull();
		expect(providerModelFromForm(form({ id: "m", extraBody: "{" }))).toBeNull();
	});
});
