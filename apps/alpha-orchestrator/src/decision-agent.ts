import {
	createConcurrencyLimiter,
	createDecisionAgent,
	withDecisionConcurrencyLimit,
} from "@repo/core";
import { config } from "./env.ts";

const baseDecisionAgent = createDecisionAgent({
	baseURL: config.LAYA_API_BASE_URL,
	apiKey: config.LAYA_API_KEY,
});

// gamma-decision is one shared CPU-bound onnxruntime sidecar, pinned to
// LAYA_THREADS — bounds how many decide() calls run concurrently instead of
// letting every request (and, per thread, every classified WebMCP tool) hit
// it at once.
export const decisionAgent = withDecisionConcurrencyLimit(
	baseDecisionAgent,
	createConcurrencyLimiter(config.LAYA_MAX_CONCURRENCY),
);
