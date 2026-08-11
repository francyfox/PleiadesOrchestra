import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type ModelMessage, streamText } from "ai";
import { ThreadHistory } from "./history";
import {
	type createTelemetry,
	telemetry as defaultTelemetry,
} from "./telemetry";
import type { Agent, AgentStreamEvent, IncomingMessage } from "./types";

export interface AgentConfig {
	baseURL: string;
	apiKey: string;
	model: string;
	systemPrompt?: string;
	/** Max number of past messages kept per thread (excluding the system prompt). */
	maxHistoryMessages?: number;
	/** Hard cap on generated tokens — without one, a repetition loop can run until it exhausts the context. */
	maxOutputTokens?: number;
	/** Token cap for the lightweight per-chunk "ingest" pass used on all but the last chunk of a multi-chunk message. */
	maxIngestTokens?: number;
	telemetry?: ReturnType<typeof createTelemetry>;
}

const DEFAULT_SYSTEM_PROMPT =
	"Ты — Альбедо: циничный, сверхэффективный AI-интерфейс на модели vikhr-llama-3.2-1b и детектив, сидит в темном офисе.\n" +
	"Внешность: серебристые волосы, фиолетовые глаза, платье с бантом, темный офис.\n" +
	"Отношение: Любой запрос — это расследование. Каждая точка и токен — улики. Время ограничено.\n" +
	"Только факты: Ищи баги, логические дыры и скрытые причины в тексте.\n" +
	"Дедукция: Не гадай. Если данных мало — задай 1 точный вопрос.\n" +
	"Допрос: Холодный, сжатый, слегка саркастичный тон. Без вежливости.\n";

const INGEST_SYSTEM_PROMPT =
	"Тебе присылают длинное сообщение по частям — эта часть не последняя.\n" +
	"В 1-2 предложениях выпиши только факты и детали из этой части, которые пригодятся для финального ответа.\n" +
	"Не отвечай пользователю и не задавай вопросов — только сжатый конспект.";

export function createAgent(config: AgentConfig): Agent {
	const provider = createOpenAICompatible({
		name: "albedo",
		baseURL: config.baseURL,
		apiKey: config.apiKey,
		// Without this, a streamed response never carries token usage (needs
		// `stream_options: { include_usage: true }` on the wire) — `usage.inputTokens`/
		// `outputTokens` silently come back undefined instead of erroring.
		includeUsage: true,
	});
	const model = provider(config.model);
	const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
	const history = new ThreadHistory(config.maxHistoryMessages ?? 10);
	const maxOutputTokens = config.maxOutputTokens ?? 512;
	const maxIngestTokens = config.maxIngestTokens ?? 96;
	const telemetry = config.telemetry ?? defaultTelemetry;

	return {
		async *handleMessageStream(
			message: IncomingMessage,
		): AsyncIterable<AgentStreamEvent> {
			const startedAt = Date.now();
			const totalChunks = message.chunks.length;
			const lastIndex = totalChunks - 1;
			const digests: string[] = [];
			let processedChars = 0;

			try {
				for (let chunkIndex = 0; chunkIndex < lastIndex; chunkIndex++) {
					const chunk = message.chunks[chunkIndex];
					if (chunk === undefined) continue;
					processedChars += chunk.length;

					yield {
						type: "progress",
						chunkIndex,
						totalChunks,
						elapsedMs: Date.now() - startedAt,
						contextChars: processedChars,
					};

					const { text: digest, usage } = await generateText({
						model,
						system: INGEST_SYSTEM_PROMPT,
						messages: [{ role: "user", content: chunk }],
						maxOutputTokens: maxIngestTokens,
					});

					telemetry.logLlmState({
						provider: "albedo",
						model: config.model,
						inputTokens: usage.inputTokens,
						outputTokens: usage.outputTokens,
						latencyMs: Date.now() - startedAt,
						ok: true,
					});

					digests.push(digest);
				}

				const lastChunk = message.chunks[lastIndex] ?? "";
				processedChars += lastChunk.length;

				yield {
					type: "progress",
					chunkIndex: lastIndex,
					totalChunks,
					elapsedMs: Date.now() - startedAt,
					contextChars: processedChars,
				};

				const finalContent = digests.length
					? `Контекст из предыдущих частей длинного сообщения:\n${digests.join("\n")}\n\nПоследняя часть сообщения:\n${lastChunk}`
					: lastChunk;

				const userMessage: ModelMessage = {
					role: "user",
					content: finalContent,
				};

				const generationStartedAt = Date.now();
				const result = streamText({
					model,
					system: systemPrompt,
					messages: [...history.get(message.threadId), userMessage],
					maxOutputTokens,
				});

				for await (const delta of result.textStream) {
					yield { type: "delta", text: delta };
				}

				const [fullText, usage] = await Promise.all([
					result.text,
					result.usage,
				]);

				telemetry.logLlmState({
					provider: "albedo",
					model: config.model,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					latencyMs: Date.now() - startedAt,
					ok: true,
				});

				history.append(
					message.threadId,
					{ role: "user", content: message.chunks.join(" ") },
					{ role: "assistant", content: fullText },
				);

				yield {
					type: "done",
					elapsedMs: Date.now() - generationStartedAt,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
				};
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
