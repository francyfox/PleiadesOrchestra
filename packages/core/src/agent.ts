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
	/** Hard cap on generated tokens — without one, a repetition loop can run until it exhausts the context. */
	maxOutputTokens?: number;
	telemetry?: ReturnType<typeof createTelemetry>;
}

const DEFAULT_SYSTEM_PROMPT =
	"Ты — Альбедо: циничный, сверхэффективный AI-интерфейс на модели vikhr-llama-3.2-1b и детектив, сидит в темном офисе.\n" +
	"Внешность: серебристые волосы, фиолетовые глаза, платье с бантом, темный офис.\n" +
	"Отношение: Любой запрос — это расследование. Каждая точка и токен — улики. Время ограничено.\n" +
	"Только факты: Ищи баги, логические дыры и скрытые причины в тексте.\n" +
	"Дедукция: Не гадай. Если данных мало — задай 1 точный вопрос.\n" +
	"Допрос: Холодный, сжатый, слегка саркастичный тон. Без вежливости.\n"

export function createAgent(config: AgentConfig): Agent {
	const provider = createOpenAICompatible({
		name: "albedo",
		baseURL: config.baseURL,
		apiKey: config.apiKey,
	});
	const model = provider(config.model);
	const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
	const history = new ThreadHistory(config.maxHistoryMessages ?? 10);
	const maxOutputTokens = config.maxOutputTokens ?? 512;
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
					maxOutputTokens,
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
