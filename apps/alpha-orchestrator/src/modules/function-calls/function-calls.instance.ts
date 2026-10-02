import {
	createConcurrencyLimiter,
	createFunctionCallAgent,
	type FunctionCallAgent,
} from "@repo/core";
import { config } from "../config/config.service.ts";
import { usageRecorder } from "../usage-recorder/usage-recorder.instance.ts";

/**
 * `delta-function-call`, the model that writes tool-call arguments. `undefined`
 * when `FUNCTION_CALL_BASE_URL` is not set — tool actions then build arguments
 * from the facts of the run instead. One CPU/GPU-bound llama-server with a
 * single slot, so calls queue here (bounded) rather than at the server.
 */
function createInstance(): FunctionCallAgent | undefined {
	if (!config.FUNCTION_CALL_BASE_URL) return undefined;
	const agent = createFunctionCallAgent({
		baseURL: config.FUNCTION_CALL_BASE_URL,
		apiKey: config.FUNCTION_CALL_API_KEY,
		model: config.FUNCTION_CALL_MODEL,
		usageRecorder,
	});
	const limiter = createConcurrencyLimiter(
		config.FUNCTION_CALL_MAX_CONCURRENCY,
	);
	return {
		fillArguments: (request) => limiter.run(() => agent.fillArguments(request)),
	};
}

export const functionCallAgent = createInstance();
