import { expect, test } from "bun:test";
import {
	DEFAULT_MODELS,
	hostedEndpoint,
	parseModels,
} from "./openrouter.service.ts";

test("--models is a comma list, blanks dropped; none given = the default candidates", () => {
	expect(parseModels(" a/b, c/d ,,")).toEqual(["a/b", "c/d"]);
	expect(parseModels(undefined)).toEqual(DEFAULT_MODELS);
	expect(parseModels(" , ")).toEqual(DEFAULT_MODELS);
});

test("the candidates are distinct paid models (no :free: those are rate limited)", () => {
	expect(new Set(DEFAULT_MODELS).size).toBe(DEFAULT_MODELS.length);
	for (const model of DEFAULT_MODELS)
		expect(model.endsWith(":free")).toBe(false);
});

test("the endpoint is the API root without /v1 and asks OpenRouter to route only to providers that support the request's parameters (json_schema)", () => {
	expect(
		hostedEndpoint("meta-llama/llama-3.1-8b-instruct", "sk-or-v1-x"),
	).toEqual({
		baseUrl: "https://openrouter.ai/api",
		apiKey: "sk-or-v1-x",
		model: "meta-llama/llama-3.1-8b-instruct",
		providerOptions: { provider: { require_parameters: true } },
	});
});
