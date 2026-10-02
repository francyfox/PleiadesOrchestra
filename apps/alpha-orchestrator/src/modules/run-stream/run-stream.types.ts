import type { GoapAction, StepPhase, WorldState } from "@repo/core";

/** One line of the NDJSON reply stream. `done`, `error` and `tool_call` end the stream. */
export type StreamEvent =
	| { type: "delta"; text: string }
	| {
			type: "done";
			elapsedMs: number;
			inputTokens?: number;
			outputTokens?: number;
			totalInputTokens?: number;
			totalOutputTokens?: number;
	  }
	/**
	 * Progress for the user, in their language: what the run is doing right now
	 * ("Ищу «cheese»…") and how each step ended. `id` is the action's name; a
	 * later line with the same `id` replaces the earlier one (it started, then
	 * finished). Not a terminal line — more follow.
	 */
	| { type: "step"; id: string; phase: StepPhase; text: string }
	| { type: "tool_call"; tool: string; arguments: unknown; callId: string }
	| { type: "error"; message: string };

/** The plan run a stream belongs to. */
export interface RunContext {
	planRunId: string;
	threadId: string;
}

/** What `prepare()` resolves before `runPlan` is called. */
export interface PreparedRun {
	state: WorldState;
	goal: Partial<WorldState>;
	actions: GoapAction[];
}
