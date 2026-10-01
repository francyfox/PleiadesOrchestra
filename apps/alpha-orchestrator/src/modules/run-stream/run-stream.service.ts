import type {
	RunPlanResult,
	WaitingOn,
	WebMcpToolCallPayload,
	WorldState,
} from "@repo/core";
import type { StreamEvent } from "./run-stream.types.ts";

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function numberOrUndefined(value: WorldState[string]): number | undefined {
	return typeof value === "number" ? value : undefined;
}

/**
 * The line for a run that stopped to wait on something only the caller can
 * supply. Today that is always a WebMCP tool call — the only `WaitingOn.kind`
 * any action in this app produces.
 */
export function toolCallEvent(waiting: WaitingOn): StreamEvent {
	if (waiting.kind !== "webmcp_tool_call") {
		return { type: "error", message: `unsupported wait: ${waiting.kind}` };
	}
	const payload = waiting.payload as WebMcpToolCallPayload;
	return {
		type: "tool_call",
		tool: payload.tool,
		arguments: payload.arguments,
		callId: crypto.randomUUID(),
	};
}

/**
 * Final line of a run that reached its goal. Timing and token counts are read
 * back from `finalState`, where the `generateReply` action put them (`apps/cli`
 * prints its usage line from this shape).
 */
export function doneEvent(
	finalState: WorldState,
	fallbackElapsedMs: number,
): StreamEvent {
	return {
		type: "done",
		elapsedMs: numberOrUndefined(finalState.elapsedMs) ?? fallbackElapsedMs,
		inputTokens: numberOrUndefined(finalState.inputTokens),
		outputTokens: numberOrUndefined(finalState.outputTokens),
		totalInputTokens: numberOrUndefined(finalState.totalInputTokens),
		totalOutputTokens: numberOrUndefined(finalState.totalOutputTokens),
	};
}

/** The terminal line that tells the caller how a finished `runPlan` ended. */
export function outcomeEvent(
	result: RunPlanResult,
	fallbackElapsedMs: number,
): StreamEvent {
	if (result.waiting) return toolCallEvent(result.waiting);
	if (!result.succeeded) {
		return {
			type: "error",
			message: result.killed ? "run cancelled" : "no plan reached the goal",
		};
	}
	return doneEvent(result.finalState, fallbackElapsedMs);
}
