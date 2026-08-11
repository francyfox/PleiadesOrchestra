import {
	createAgent,
	createTelemetry,
	createVictoriaMetricsReporter,
	jsonReporter,
} from "@repo/core";
import { config } from "./env.ts";

const reporters = [jsonReporter()];
if (config.VICTORIA_METRICS_USERNAME && config.VICTORIA_METRICS_PASSWORD) {
	reporters.push(
		createVictoriaMetricsReporter(config.VICTORIA_METRICS_URL, {
			username: config.VICTORIA_METRICS_USERNAME,
			password: config.VICTORIA_METRICS_PASSWORD,
		}),
	);
}

export const agent = createAgent({
	baseURL: config.LLM_BASE_URL,
	apiKey: config.LLM_API_KEY,
	model: config.LLM_MODEL,
	telemetry: createTelemetry(reporters),
});
