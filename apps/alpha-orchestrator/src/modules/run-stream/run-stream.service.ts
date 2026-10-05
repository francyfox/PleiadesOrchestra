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

/** Longest site answer passed on to the visitor. */
const HINT_CHARS = 400;

/**
 * What the site's last tool said (`webmcp:<tool>:text`) — when it could not do
 * what was asked, that is its own recommendation («try a broader word…»),
 * which beats any wording of ours.
 */
function lastSiteAnswer(state: WorldState): string | undefined {
	const keys = Object.keys(state).filter(
		(key) => key.startsWith("webmcp:") && key.endsWith(":text"),
	);
	const value = keys.length > 0 ? state[keys[keys.length - 1] as string] : "";
	return typeof value === "string" && value.trim() !== ""
		? value.trim().slice(0, HINT_CHARS)
		: undefined;
}

/** The terminal line that tells the caller how a finished `runPlan` ended. */
export function outcomeEvent(
	result: RunPlanResult,
	fallbackElapsedMs: number,
): StreamEvent {
	if (result.waiting) return toolCallEvent(result.waiting);
	if (!result.succeeded) {
		if (result.killed) return { type: "error", message: "run cancelled" };
		const hint = lastSiteAnswer(result.finalState);
		return {
			type: "error",
			// A task the site couldn't do — the visitor's request, not a broken
			// server: the widget tells it apart from a lost connection.
			code: "task_failed",
			message: "no plan reached the goal",
			...(hint ? { hint } : {}),
		};
	}
	return doneEvent(result.finalState, fallbackElapsedMs);
}
