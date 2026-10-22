import type { Endpoint } from "../delta/delta.types.ts";

/**
 * Candidates for delta on OpenRouter: small, cheap, structured outputs
 * (json_schema), no mandatory reasoning. Prices per 1M tokens (in / out) as
 * listed when picked: 0.09/0.30, 0.05/0.08, 0.04/0.05, 0.029/0.03 USD.
 */
export const DEFAULT_MODELS = [
	"qwen/qwen3-30b-a3b-instruct-2507",
	"meta-llama/llama-3.1-8b-instruct",
	"google/gemma-3-4b-it",
	"mistralai/mistral-nemo",
];

/** `--models a,b,c`; blank or missing = the defaults. */
export function parseModels(value: string | undefined): string[] {
	const models = (value ?? "")
		.split(",")
		.map((model) => model.trim())
		.filter(Boolean);
	return models.length ? models : DEFAULT_MODELS;
}

/** The API root (the client appends `/v1`). `require_parameters`: route only to providers that honour `response_format`, else the schema is silently dropped. */
export function hostedEndpoint(model: string, apiKey: string): Endpoint {
	return {
		baseUrl: "https://openrouter.ai/api",
		apiKey,
		model,
		providerOptions: { provider: { require_parameters: true } },
	};
}
