import type {
	DecisionAnswer,
	DecisionQuestion,
	DecisionState,
} from "@repo/core";

/** The slice of `@receptron/laya`'s `Laya` the decision model needs, so tests can fake it. */
export interface LayaEngine {
	systemOne(
		state: unknown,
		questions: Record<string, unknown>,
	): Promise<{
		model: string;
		answers: Record<string, unknown>;
		usage: { input_tokens: number; output_tokens: number };
	}>;
	close(): Promise<void>;
}

/** Laya as the commands use it: one decision call, timed; a server's or this process's. */
export interface LoadedLaya {
	decide(
		state: DecisionState,
		questions: Record<string, DecisionQuestion>,
	): Promise<Record<string, DecisionAnswer>>;
	/** `decide` for a request in words (state `{ message }`, as production), with its wall time. */
	ask(
		request: string,
		questions: Record<string, DecisionQuestion>,
	): Promise<{ answers: Record<string, DecisionAnswer>; latencyMs: number }>;
	/** Time to load the weights here; 0 for a server. */
	loadMs: number;
	close(): Promise<void>;
}
