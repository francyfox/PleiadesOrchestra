import {
	createConcurrencyLimiter,
	createFunctionCallAgent,
	type FunctionCallAgent,
	translateTexts,
} from "@repo/core";
import { agentSettings } from "../agent-settings/agent-settings.instance.ts";
import { providerOptionsOf } from "../agent-settings/agent-settings.service.ts";
import { config } from "../config/config.service.ts";
import { usageRecorder } from "../usage-recorder/usage-recorder.instance.ts";

/**
 * `alpha-understand`: one call per new message (English + tasks + products), also the translator of tool texts for gamma (`english-only`).
 * Until a model is picked it is beta-text's server. Rebuilt when an admin saves.
 * shortcut: temperature fixed at 0 (the answer must be reproducible; the model's own
 * temperature is for chat), its own limiter sized like delta's; split when
 * alpha-understand sits on its own server.
 */
function createInstance(): FunctionCallAgent | undefined {
	if (!agentSettings.effective("alpha-understand").baseUrl) return undefined;
	const current = agentSettings.track(() => {
		const s = agentSettings.effective("alpha-understand");
		return createFunctionCallAgent({
			baseURL: s.baseUrl,
			apiKey: s.apiKey,
			model: s.model,
			temperature: 0,
			maxOutputTokens: 768,
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

export const understandAgent = createInstance();

/** English for a batch of strings; unset when alpha-understand has no server (callers then refuse the text). */
export const translateWithAlpha = understandAgent
	? (texts: string[]) => translateTexts(understandAgent, texts)
	: undefined;
