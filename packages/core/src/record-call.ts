import {
	type createTelemetry,
	telemetry as defaultTelemetry,
} from "./telemetry";
import type { LlmCallRecord, UsageRecorder } from "./types";

/**
 * The one place a finished call is reported: a telemetry line (stdout) and a
 * row for the usage ledger (`llm_calls`), which both the admin's analytics and
 * the request graph read. Callers describe the call once and don't repeat
 * `logLlmState` next to `record`.
 */
export function recordCall(
	usageRecorder: UsageRecorder | undefined,
	call: LlmCallRecord,
	telemetry: ReturnType<typeof createTelemetry> = defaultTelemetry,
): void {
	telemetry.logLlmState({
		kind: call.kind,
		provider: call.provider,
		model: call.model,
		inputTokens: call.inputTokens,
		outputTokens: call.outputTokens,
		latencyMs: call.latencyMs,
		ok: call.ok,
		error: call.error,
	});
	usageRecorder?.record(call);
}
