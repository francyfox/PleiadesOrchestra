import {
	createAgent,
	createConcurrencyLimiter,
	withConcurrencyLimit,
} from "@repo/core";
import { historyStore, usageRecorder } from "./db/instance.ts";
import { config } from "./env.ts";

/**
 * Messages of a thread the model sees as context: none. The 1B model copies
 * its own earlier replies (after a few canned "How can I help?" answers in the
 * context it answers nothing else), so it works on the current message only.
 * The exchange is still stored (admin panel, ledger) — per-user retention
 * must cover this window (checked in index.ts).
 */
export const AGENT_MAX_HISTORY_MESSAGES = 0;

// No custom telemetry reporters here — falls back to `@repo/core`'s default
// (stdout JSON lines). Sentry is the planned replacement for anything more
// than that; VictoriaMetrics push support was removed, not just unwired.
const baseAgent = createAgent({
	baseURL: config.LLM_BASE_URL,
	apiKey: config.LLM_API_KEY,
	model: config.LLM_MODEL,
	maxHistoryMessages: AGENT_MAX_HISTORY_MESSAGES,
	historyStore,
	usageRecorder,
});

// beta-text is one shared CPU-bound llama-server — bounds how many replies
// stream concurrently instead of letting every request hit it at once.
export const agent = withConcurrencyLimit(
	baseAgent,
	createConcurrencyLimiter(config.LLM_MAX_CONCURRENCY),
);
