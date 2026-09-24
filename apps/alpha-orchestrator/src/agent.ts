import { createAgent } from "@repo/core";
import { historyStore, usageRecorder } from "./db/instance.ts";
import { config } from "./env.ts";

/** Messages of a thread the model sees as context. Per-user retention must cover it (checked in index.ts). */
export const AGENT_MAX_HISTORY_MESSAGES = 10;

// No custom telemetry reporters here — falls back to `@repo/core`'s default
// (stdout JSON lines). Sentry is the planned replacement for anything more
// than that; VictoriaMetrics push support was removed, not just unwired.
export const agent = createAgent({
	baseURL: config.LLM_BASE_URL,
	apiKey: config.LLM_API_KEY,
	model: config.LLM_MODEL,
	maxHistoryMessages: AGENT_MAX_HISTORY_MESSAGES,
	historyStore,
	usageRecorder,
});
