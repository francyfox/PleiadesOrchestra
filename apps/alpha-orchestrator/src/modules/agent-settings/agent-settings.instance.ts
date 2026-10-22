import { config } from "../config/config.service.ts";
import { db } from "../database/database.instance.ts";
import {
	createProvidersConfig,
	seedProviders,
} from "../providers/providers.service.ts";
import { createAgentSettings } from "./agent-settings.service.ts";

// Env names each agent's server; the model parameters live in providers.toml
// (seeded from these servers on first start, then edited in the admin panel).
export const agentSettings = createAgentSettings({
	db,
	env: {
		"beta-text": {
			baseUrl: config.LLM_BASE_URL,
			apiKey: config.LLM_API_KEY,
			model: config.LLM_MODEL,
		},
		"delta-function-call": {
			baseUrl: config.FUNCTION_CALL_BASE_URL ?? "",
			apiKey: config.FUNCTION_CALL_API_KEY,
			model: config.FUNCTION_CALL_MODEL,
		},
		"gamma-decision": {
			baseUrl: config.LAYA_API_BASE_URL,
			apiKey: config.LAYA_API_KEY,
			model: config.LAYA_MODEL,
		},
	},
	providers: await createProvidersConfig({
		path: config.PROVIDERS_CONFIG_PATH,
		seed: () =>
			seedProviders([
				{
					id: "local-text",
					baseUrl: config.LLM_BASE_URL,
					apiKeyVar: "LLM_API_KEY",
					model: {
						id: config.LLM_MODEL,
						name: config.LLM_MODEL,
						type: "language",
						temperature: 0.3,
						extraBody: {},
					},
				},
				{
					id: "local-function-call",
					baseUrl: config.FUNCTION_CALL_BASE_URL ?? "",
					apiKeyVar: "FUNCTION_CALL_API_KEY",
					// Arguments must be reproducible; `none` keeps Qwen3 on Ollama from "thinking" ~1000 tokens into `{}`.
					model: {
						id: config.FUNCTION_CALL_MODEL,
						name: config.FUNCTION_CALL_MODEL,
						type: "language",
						temperature: 0,
						reasoningEffort: "none",
						extraBody: {},
					},
				},
				{
					id: "local-decision",
					baseUrl: config.LAYA_API_BASE_URL,
					apiKeyVar: "LAYA_API_KEY",
					model: {
						id: config.LAYA_MODEL,
						name: config.LAYA_MODEL,
						type: "decision",
						extraBody: {},
					},
				},
				// The in-process translator, only where a library is installed; no URL, no key.
				...(config.TRANSLATE_LIB_PATH
					? [
							{
								id: "local-translate",
								baseUrl: "",
								apiKeyVar: "",
								model: {
									id: config.TRANSLATE_MODEL_REPO,
									name: config.TRANSLATE_MODEL_REPO,
									type: "translation" as const,
									extraBody: {},
								},
							},
						]
					: []),
			]),
	}),
});
