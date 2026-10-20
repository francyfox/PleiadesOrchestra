import {
	type Agent,
	createAgent,
	createConcurrencyLimiter,
	withConcurrencyLimit,
} from "@repo/core";
import { agentSettings } from "../agent-settings/agent-settings.instance.ts";
import { providerOptionsOf } from "../agent-settings/agent-settings.service.ts";
import { config } from "../config/config.service.ts";
import { historyStore } from "../history/history.instance.ts";
import { DEFAULT_REPLY_PROMPT } from "../persona/persona.service.ts";
import { usageRecorder } from "../usage-recorder/usage-recorder.instance.ts";
import { productRequestPrompt } from "./agents.service.ts";

/**
 * Messages of a thread the model sees as context: none. The 1B model copies
 * its own earlier replies (after a few canned "How can I help?" answers in the
 * context it answers nothing else), so it works on the current message only.
 * The exchange is still stored (admin panel, ledger) — per-visitor retention
 * must cover this window (checked in index.ts).
 */
export const AGENT_MAX_HISTORY_MESSAGES = 0;

// Built from the effective settings and rebuilt when an admin saves them
// (agentSettings.track); the history store and the limiters outlive a rebuild.
// No custom telemetry reporters here — falls back to `@repo/core`'s default
// (stdout JSON lines). Sentry is the planned replacement for anything more
// than that; VictoriaMetrics push support was removed, not just unwired.
const modelConfig = () => {
	const s = agentSettings.effective("beta-text");
	return {
		baseURL: s.baseUrl,
		apiKey: s.apiKey,
		model: s.model,
		temperature: s.temperature,
		providerOptions: providerOptionsOf(s),
		provider: s.provider,
	};
};

// Bounds how many calls run concurrently instead of letting every request hit
// the model server at once; LLM_MAX_CONCURRENCY should match its parallel
// slots. Replies and request extraction share the limit: it is the same server.
const llmLimiter = createConcurrencyLimiter(config.LLM_MAX_CONCURRENCY);
const currentAgent = agentSettings.track(() =>
	withConcurrencyLimit(
		createAgent({
			...modelConfig(),
			// Replies are written in the channel's persona; this is the standard one.
			systemPrompt: DEFAULT_REPLY_PROMPT,
			maxHistoryMessages: AGENT_MAX_HISTORY_MESSAGES,
			historyStore,
			usageRecorder,
		}),
		llmLimiter,
	),
);
export const agent: Agent = {
	handleMessageStream: (message) => currentAgent().handleMessageStream(message),
	resetThread: (threadId) => currentAgent().resetThread(threadId),
};

/**
 * Same model, different job: reads "what to buy" out of a shopping message and
 * answers with JSON only. Own system prompt, a few tokens of output, and
 * stateless — its calls reach the usage ledger but its exchanges are not
 * stored as chat history.
 */
const currentProductRequestAgent = agentSettings.track(() =>
	withConcurrencyLimit(
		createAgent({
			...modelConfig(),
			systemPrompt: productRequestPrompt(),
			maxHistoryMessages: 0,
			maxOutputTokens: 48,
			usageRecorder,
		}),
		llmLimiter,
	),
);
export const productRequestAgent: Agent = {
	handleMessageStream: (message) =>
		currentProductRequestAgent().handleMessageStream(message),
	resetThread: (threadId) => currentProductRequestAgent().resetThread(threadId),
};
