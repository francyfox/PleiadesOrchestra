import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { type Experimental_DecisionModel, experimental_decide } from "ai";
import type {
	DecisionAgent,
	DecisionAnswer,
	DecisionQuestion,
	DecisionState,
} from "./decision-types";
import {
	type createTelemetry,
	telemetry as defaultTelemetry,
} from "./telemetry";
import { reportTokens } from "./usage-collector";

export interface DecisionAgentConfig {
	/** `gamma-decision` root, without `/v1` (the TypeSafe client appends it); a URL ending in `/decisions` (OpenRouter) is posted to as it is. */
	baseURL: string;
	apiKey: string;
	/** Model name sent in the request body (`laya` by default); an external Laya server may serve it under another name. */
	modelId?: string;
	/** Name the telemetry reports for the provider ("laya" by default; the picked provider's id otherwise). */
	provider?: string;
	/** Any AI SDK decision model; defaults to `gamma-decision` over HTTP. */
	model?: Experimental_DecisionModel;
	fetchImpl?: typeof fetch;
	telemetry?: ReturnType<typeof createTelemetry>;
}

/**
 * `DecisionAgent` over the AI SDK's `experimental_decide`. By default the
 * model is `@ai-sdk/typesafe-ai` pointed at `gamma-decision`'s
 * `POST /v1/systemone` — the ONNX inference stays isolated in
 * `apps/gamma-decision`, nothing from `@receptron/laya` is pulled in here.
 * Callers may inject any other decision model (an in-process Laya, a mock).
 *
 * Same telemetry contract as `createAgent` (`logLlmState` per call, success
 * and failure): `Agent` and `DecisionAgent` are both "agent" ports and
 * should be equally observable, not just structurally similar factories.
 */
export function createDecisionAgent(
	config: DecisionAgentConfig,
): DecisionAgent {
	// OpenRouter serves the same wire shape at `/api/alpha/decisions`; the SDK always appends `/v1/systemone`.
	const wholeEndpoint = config.baseURL.endsWith("/decisions");
	const send = config.fetchImpl ?? fetch;
	const model =
		config.model ??
		createTypeSafeAi({
			baseURL: `${config.baseURL}/v1`,
			apiKey: config.apiKey,
			fetch: wholeEndpoint
				? (((_url, init) => send(config.baseURL, init)) as typeof fetch)
				: config.fetchImpl,
		}).decisionModel(config.modelId ?? "laya");
	const telemetry = config.telemetry ?? defaultTelemetry;
	const provider = config.provider ?? "laya";
	const modelName = config.provider
		? (config.modelId ?? "systemone")
		: "laya-system-one";

	return {
		async decide(
			state: DecisionState,
			questions: Record<string, DecisionQuestion>,
		): Promise<Record<string, DecisionAnswer>> {
			const startedAt = Date.now();

			try {
				const result = await experimental_decide({
					model,
					state,
					questions,
					maxRetries: 0,
				});

				const tokens = {
					inputTokens: result.usage.inputTokens,
					outputTokens: result.usage.outputTokens,
				};
				reportTokens(tokens);
				telemetry.logLlmState({
					provider,
					model: modelName,
					latencyMs: Date.now() - startedAt,
					ok: true,
					...tokens,
				});

				return result.answers as Record<string, DecisionAnswer>;
			} catch (error) {
				telemetry.logLlmState({
					provider,
					model: modelName,
					latencyMs: Date.now() - startedAt,
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
		},
	};
}
