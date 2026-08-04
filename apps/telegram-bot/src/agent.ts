import {
	createAgent,
	createTelemetry,
	createVictoriaMetricsReporter,
	jsonReporter,
} from "@repo/core";
import { config } from "./env.ts";

export const agent = createAgent({
	baseURL: config.LLM_BASE_URL,
	apiKey: config.LLM_API_KEY,
	model: config.LLM_MODEL,
	telemetry: createTelemetry([
		jsonReporter(),
		createVictoriaMetricsReporter(config.VICTORIA_METRICS_URL),
	]),
});
