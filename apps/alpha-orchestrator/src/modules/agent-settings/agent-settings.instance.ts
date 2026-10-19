import { config } from "../config/config.service.ts";
import { db } from "../database/database.instance.ts";
import { createAgentSettings } from "./agent-settings.service.ts";

// Env stays the default of every field; the admin panel's overrides sit on top.
export const agentSettings = createAgentSettings({
	db,
	secret: config.PROVIDER_KEYS_SECRET,
	defaults: {
		"beta-text": {
			baseUrl: config.LLM_BASE_URL,
			apiKey: config.LLM_API_KEY,
			model: config.LLM_MODEL,
			temperature: config.LLM_TEMPERATURE,
		},
		"delta-function-call": {
			baseUrl: config.FUNCTION_CALL_BASE_URL ?? "",
			apiKey: config.FUNCTION_CALL_API_KEY,
			model: config.FUNCTION_CALL_MODEL,
			temperature: config.FUNCTION_CALL_TEMPERATURE,
			reasoningEffort: config.FUNCTION_CALL_REASONING_EFFORT,
		},
		"gamma-decision": {
			baseUrl: config.LAYA_API_BASE_URL,
			apiKey: config.LAYA_API_KEY,
			model: config.LAYA_MODEL,
		},
	},
});

await agentSettings.refresh();
