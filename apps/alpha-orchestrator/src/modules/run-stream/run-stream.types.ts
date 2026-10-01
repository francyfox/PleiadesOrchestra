import type { GoapAction, WorldState } from "@repo/core";

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
