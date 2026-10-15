import {
	createConcurrencyLimiter,
	createDecisionAgent,
	withDecisionConcurrencyLimit,
} from "@repo/core";
import { config } from "../config/config.service.ts";

const baseDecisionAgent = createDecisionAgent({
	baseURL: config.LAYA_API_BASE_URL,
	apiKey: config.LAYA_API_KEY,
	modelId: config.LAYA_MODEL,
});

// Bounds how many decide() calls run concurrently instead of letting every
// request (and, per thread, every classified WebMCP tool) hit the Laya server
// at once; LAYA_MAX_CONCURRENCY should match its threads (LAYA_THREADS locally).
export const decisionAgent = withDecisionConcurrencyLimit(
	baseDecisionAgent,
	createConcurrencyLimiter(config.LAYA_MAX_CONCURRENCY),
);
