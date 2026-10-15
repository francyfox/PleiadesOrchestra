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

export interface DecisionAgentConfig {
	/** `gamma-decision` root, without `/v1` (the TypeSafe client appends it). */
	baseURL: string;
	apiKey: string;
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
	const model =
		config.model ??
		createTypeSafeAi({
			baseURL: `${config.baseURL}/v1`,
			apiKey: config.apiKey,
			fetch: config.fetchImpl,
		}).decisionModel("laya");
	const telemetry = config.telemetry ?? defaultTelemetry;

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

				telemetry.logLlmState({
					provider: "laya",
					model: "laya-system-one",
					latencyMs: Date.now() - startedAt,
					ok: true,
				});

				return result.answers as Record<string, DecisionAnswer>;
			} catch (error) {
				telemetry.logLlmState({
					provider: "laya",
					model: "laya-system-one",
					latencyMs: Date.now() - startedAt,
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
		},
	};
}
