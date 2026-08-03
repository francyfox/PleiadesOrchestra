import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type ModelMessage } from "ai";
import { ThreadHistory } from "./history";
import {
	type createTelemetry,
	telemetry as defaultTelemetry,
} from "./telemetry";
import type { Agent, IncomingMessage, OutgoingMessage } from "./types";

export interface AgentConfig {
	baseURL: string;
	apiKey: string;
	model: string;
	systemPrompt?: string;
	/** Max number of past messages kept per thread (excluding the system prompt). */
	maxHistoryMessages?: number;
	telemetry?: ReturnType<typeof createTelemetry>;
}

const DEFAULT_SYSTEM_PROMPT =
	"You are a concise personal assistant. Answer briefly and directly.";

export function createAgent(config: AgentConfig): Agent {
	const provider = createOpenAICompatible({
		name: "albedo",
		baseURL: config.baseURL,
		apiKey: config.apiKey,
	});
	const model = provider(config.model);
	const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
	const history = new ThreadHistory(config.maxHistoryMessages ?? 10);
	const telemetry = config.telemetry ?? defaultTelemetry;

	return {
		async handleMessage(message: IncomingMessage): Promise<OutgoingMessage> {
			const userMessage: ModelMessage = { role: "user", content: message.text };
			const startedAt = Date.now();

			try {
				const { text, usage } = await generateText({
					model,
					system: systemPrompt,
					messages: [...history.get(message.threadId), userMessage],
				});

				telemetry.logLlmState({
					provider: "albedo",
					model: config.model,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					latencyMs: Date.now() - startedAt,
					ok: true,
				});

				history.append(message.threadId, userMessage, {
					role: "assistant",
					content: text,
				});

				return { text };
			} catch (error) {
				telemetry.logLlmState({
					provider: "albedo",
					model: config.model,
					latencyMs: Date.now() - startedAt,
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
		},

		resetThread(threadId: string): void {
			history.reset(threadId);
		},
	};
}
