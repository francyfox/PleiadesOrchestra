import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type ModelMessage, streamText } from "ai";
import { InMemoryHistoryStore } from "./history";
import { recordCall } from "./record-call";
import {
	type createTelemetry,
	telemetry as defaultTelemetry,
} from "./telemetry";
import type {
	Agent,
	AgentStreamEvent,
	CallContext,
	HistoryStore,
	IncomingMessage,
	LlmCallKind,
	UsageRecorder,
} from "./types";

export interface AgentConfig {
	baseURL: string;
	apiKey: string;
	model: string;
	systemPrompt?: string;
	/**
	 * Past messages of a thread the model sees as context (excluding the system
	 * prompt). `0` = stateless: the model gets only the current message, while
	 * the exchange is still appended to the history store.
	 */
	maxHistoryMessages?: number;
	/** Hard cap on generated tokens — without one, a repetition loop can run until it exhausts the context. */
	maxOutputTokens?: number;
	/** Token cap for the lightweight per-chunk "ingest" pass used on all but the last chunk of a multi-chunk message. */
	maxIngestTokens?: number;
	telemetry?: ReturnType<typeof createTelemetry>;
	/** Defaults to an in-memory store. */
	historyStore?: HistoryStore;
	/** Called for every model call, including ingest passes. */
	usageRecorder?: UsageRecorder;
}

const DEFAULT_SYSTEM_PROMPT =
	"Ты — Альбедо: циничный, сверхэффективный AI-интерфейс";

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
	const maxHistoryMessages = config.maxHistoryMessages ?? 10;
	const history =
		config.historyStore ?? new InMemoryHistoryStore(maxHistoryMessages);
	const maxOutputTokens = config.maxOutputTokens ?? 512;
	const maxIngestTokens = config.maxIngestTokens ?? 96;
	const telemetry = config.telemetry ?? defaultTelemetry;
	const usageRecorder = config.usageRecorder;

	/** Every model call goes through here: telemetry (stdout) plus the usage port. */
	function reportCall(
		callContext: CallContext,
		kind: LlmCallKind,
		startedAt: number,
		outcome:
			| { ok: true; inputTokens?: number; outputTokens?: number }
			| { ok: false; error: string },
	) {
		const latencyMs = Date.now() - startedAt;
		recordCall(
			usageRecorder,
			{
				...callContext,
				kind,
				provider: "albedo",
				model: config.model,
				latencyMs,
				at: Date.now(),
				...outcome,
			},
			telemetry,
		);
	}

	return {
		async *handleMessageStream(
			message: IncomingMessage,
		): AsyncIterable<AgentStreamEvent> {
			const startedAt = Date.now();
			const totalChunks = message.chunks.length;
			const lastIndex = totalChunks - 1;
			const digests: string[] = [];
			let processedChars = 0;
			const callContext: CallContext = {
				threadId: message.threadId,
				userId: message.userId,
				planRunId: message.planRunId,
				actionName: message.actionName,
			};
			// Running totals across ingest passes + the final generation;
			// `undefined` as soon as any call didn't report usage.
			let totalInputTokens: number | undefined = 0;
			let totalOutputTokens: number | undefined = 0;
			const addUsage = (usage: {
				inputTokens?: number;
				outputTokens?: number;
			}) => {
				totalInputTokens =
					totalInputTokens === undefined || usage.inputTokens === undefined
						? undefined
						: totalInputTokens + usage.inputTokens;
				totalOutputTokens =
					totalOutputTokens === undefined || usage.outputTokens === undefined
						? undefined
						: totalOutputTokens + usage.outputTokens;
			};
			// The model call currently in flight, if any — so the catch below
			// reports a failure against the right call, and doesn't report a
			// failed history write as a failed model call.
			let inFlight: { kind: LlmCallKind; startedAt: number } | undefined;

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

					inFlight = { kind: "ingest", startedAt: Date.now() };
					const { text: digest, usage } = await generateText({
						model,
						system: INGEST_SYSTEM_PROMPT,
						messages: [{ role: "user", content: chunk }],
						maxOutputTokens: maxIngestTokens,
					});

					reportCall(callContext, "ingest", inFlight.startedAt, {
						ok: true,
						inputTokens: usage.inputTokens,
						outputTokens: usage.outputTokens,
					});
					addUsage(usage);
					inFlight = undefined;

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

				// `get(_, 0)` isn't "nothing" for every store (`slice(-0)` is everything), so 0 is handled here.
				const past =
					maxHistoryMessages > 0
						? await history.get(message.threadId, maxHistoryMessages)
						: [];
				const generationStartedAt = Date.now();
				inFlight = { kind: "generate", startedAt: generationStartedAt };
				const result = streamText({
					model,
					system: systemPrompt,
					messages: [...past, userMessage],
					maxOutputTokens,
				});

				for await (const delta of result.textStream) {
					yield { type: "delta", text: delta };
				}

				const [fullText, usage] = await Promise.all([
					result.text,
					result.usage,
				]);

				reportCall(callContext, "generate", generationStartedAt, {
					ok: true,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
				});
				addUsage(usage);
				inFlight = undefined;

				await history.append(callContext, [
					{
						role: "user",
						content: message.historyText ?? message.chunks.join(" "),
					},
					{ role: "assistant", content: fullText },
				]);

				yield {
					type: "done",
					elapsedMs: Date.now() - generationStartedAt,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					totalInputTokens,
					totalOutputTokens,
				};
			} catch (error) {
				if (inFlight) {
					reportCall(callContext, inFlight.kind, inFlight.startedAt, {
						ok: false,
						error: error instanceof Error ? error.message : String(error),
					});
				}
				throw error;
			}
		},

		async resetThread(threadId: string): Promise<void> {
			await history.reset(threadId);
		},
	};
}
