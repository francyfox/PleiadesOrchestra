import type {
	RunPlanResult,
	WaitingOn,
	WebMcpToolCallPayload,
	WorldState,
} from "@repo/core";
import { PAGE_LANG_FACT, stepLanguage } from "@repo/core";
import type { StoredStep } from "../database/database.schema.ts";
import type { StreamEvent } from "./run-stream.types.ts";

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const SERVER_TROUBLE_TEXT = {
	running: {
		ru: "Сервер перегружен, повторяю запрос — ответ может занять больше времени…",
		en: "The server is overloaded, retrying — the answer may take longer…",
	},
	done: { ru: "Сервер снова отвечает", en: "The server is answering again" },
	failed: { ru: "Сервер не отвечает", en: "The server is not answering" },
} as const;

/** The step line that tells the visitor why the answer is slow: a model server is retried (`watchServerTrouble`). */
export function serverTroubleStep(
	lang: string | undefined,
	phase: StoredStep["phase"],
): StoredStep {
	return {
		id: "serverTrouble",
		phase,
		text: SERVER_TROUBLE_TEXT[phase][
			stepLanguage(lang ? { [PAGE_LANG_FACT]: lang } : {})
		],
	};
}

function numberOrUndefined(value: WorldState[string]): number | undefined {
	return typeof value === "number" ? value : undefined;
}

/**
 * The line for a run that stopped to wait on something only the caller can
 * supply. Today that is always a WebMCP tool call — the only `WaitingOn.kind`
 * any action in this app produces.
 */
/** Checkpoint fact: the tool the run is waiting on. Together with the run id (the `callId`) it is what `prepareResume` checks an answer against. */
export const AWAITED_TOOL_FACT = "awaitedTool";

/** Checkpoint fact: the JSON arguments of the awaited call, so a reloaded widget can be asked to run it (`pending`). */
export const AWAITED_ARGS_FACT = "awaitedArgs";

/** Checkpoint fact left when a wait timed out: JSON `{ prompt, tasksLeft }`, shown to the widget once (`pending`), dropped after a day. */
export const EXPIRED_FACT = "expiredRequest";

/** How long a run waits for the browser to run its tool and answer; then the request counts as abandoned and its checkpoint is released (`waiting-runs`). */
export const BROWSER_WAIT_TIMEOUT_MS = 60_000;

/**
 * Checkpoint fact of a run that asked the visitor for details it needs (`missingParams`) and ended its
 * reply: JSON `{ request, asked }` (the English request, what was asked). The checkpoint also holds the
 * run's starting facts and goal. The next message may answer it (`prepareNewMessage`). Not a browser wait:
 * it has no `awaitedTool`, so `pending` and the 60 s expiry ignore it.
 */
export const VISITOR_WAIT_FACT = "visitorWait";

/** A visitor thinks longer than a browser: an unanswered question is dropped after this (`waiting-runs`). */
export const VISITOR_WAIT_TIMEOUT_MS = 10 * 60_000;

/** The arguments of a WebMCP wait, as JSON; `undefined` for any other wait. */
export function awaitedArgs(waiting: WaitingOn): string | undefined {
	return waiting.kind === "webmcp_tool_call"
		? JSON.stringify((waiting.payload as WebMcpToolCallPayload).arguments ?? {})
		: undefined;
}

/** The tool a WebMCP wait names; `undefined` for any other wait. */
export function awaitedTool(waiting: WaitingOn): string | undefined {
	return waiting.kind === "webmcp_tool_call"
		? (waiting.payload as WebMcpToolCallPayload).tool
		: undefined;
}

export function toolCallEvent(
	waiting: WaitingOn,
	callId: string = crypto.randomUUID(),
): StreamEvent {
	if (waiting.kind !== "webmcp_tool_call") {
		return { type: "error", message: `unsupported wait: ${waiting.kind}` };
	}
	const payload = waiting.payload as WebMcpToolCallPayload;
	return {
		type: "tool_call",
		tool: payload.tool,
		arguments: payload.arguments,
		callId,
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
	/** Id of the run issuing a tool call: the answer must quote it back. */
	callId?: string,
): StreamEvent {
	if (result.waiting) return toolCallEvent(result.waiting, callId);
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
