import {
	createConcurrencyLimiter,
	createFunctionCallAgent,
	type FunctionCallAgent,
} from "@repo/core";
import { agentSettings } from "../agent-settings/agent-settings.instance.ts";
import { providerOptionsOf } from "../agent-settings/agent-settings.service.ts";
import { config } from "../config/config.service.ts";
import { usageRecorder } from "../usage-recorder/usage-recorder.instance.ts";

/**
 * `delta-function-call`, the model that writes tool-call arguments. `undefined`
 * when no base URL is in effect at startup — tool actions then build arguments
 * from the facts of the run instead. Rebuilt when an admin saves new settings.
 * Calls queue here (bounded) rather than at the server;
 * FUNCTION_CALL_MAX_CONCURRENCY should match its parallel slots (the local
 * llama-server has one, Ollama has OLLAMA_NUM_PARALLEL).
 *
 * shortcut: a base URL saved while none was in effect at startup needs a
 * restart to switch delta on; lift it by always wrapping and skipping silently.
 */
function createInstance(): FunctionCallAgent | undefined {
	if (!agentSettings.effective("delta-function-call").baseUrl) return undefined;
	const current = agentSettings.track(() => {
		const s = agentSettings.effective("delta-function-call");
		return createFunctionCallAgent({
			baseURL: s.baseUrl,
			apiKey: s.apiKey,
			model: s.model,
			temperature: s.temperature,
			providerOptions: providerOptionsOf(s),
			provider: s.provider,
			usageRecorder,
		});
	});
	const limiter = createConcurrencyLimiter(
		config.FUNCTION_CALL_MAX_CONCURRENCY,
	);
	return {
		fillArguments: (request) =>
			limiter.run(() => current().fillArguments(request)),
	};
}

export const functionCallAgent = createInstance();
