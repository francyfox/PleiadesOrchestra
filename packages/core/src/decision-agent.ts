import type {
	DecisionAgent,
	DecisionAnswer,
	DecisionQuestion,
} from "./decision-types";
import { createBearerJsonClient } from "./http-client";
import {
	type createTelemetry,
	telemetry as defaultTelemetry,
} from "./telemetry";

export interface DecisionAgentConfig {
	baseURL: string;
	apiKey: string;
	fetchImpl?: typeof fetch;
	telemetry?: ReturnType<typeof createTelemetry>;
}

/**
 * Thin HTTP client for `laya-api`'s `/v1/decide`, built on the same
 * `createBearerJsonClient` primitive as any other bearer-authed JSON call in
 * this package — not pulling `@receptron/laya`/`onnxruntime-node` in here;
 * the actual ONNX inference stays isolated in `apps/gamma-decision`.
 *
 * Same telemetry contract as `createAgent` (`logLlmState` per call, success
 * and failure): `Agent` and `DecisionAgent` are both "agent" ports and
 * should be equally observable, not just structurally similar factories.
 */
export function createDecisionAgent(
	config: DecisionAgentConfig,
): DecisionAgent {
	const postJson = createBearerJsonClient(config);
	const telemetry = config.telemetry ?? defaultTelemetry;

	return {
		async decide(
			state: unknown,
			questions: Record<string, DecisionQuestion>,
		): Promise<Record<string, DecisionAnswer>> {
			const startedAt = Date.now();

			try {
				const body = await postJson<{
					answers: Record<string, DecisionAnswer>;
				}>("/v1/decide", { state, questions });

				telemetry.logLlmState({
					provider: "laya",
					model: "laya-system-one",
					latencyMs: Date.now() - startedAt,
					ok: true,
				});

				return body.answers;
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
