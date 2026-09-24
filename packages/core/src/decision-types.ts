/**
 * Request/response shapes for a Laya-style "System-1" typed-decision model,
 * reached via `laya-api`. Mirrors `@receptron/laya`'s `Question`/`Answer`
 * shapes (which themselves reproduce TypeSafe Jev's `system_one` API) —
 * redeclared here instead of imported so `packages/core` doesn't need to
 * depend on `@receptron/laya`/`onnxruntime-node`; only `apps/gamma-decision` does.
 */
export interface ChoiceQuestion {
	type: "choice";
	instructions: string | object;
	criteria: Record<string, string | null> | string[];
}

export interface ScoreQuestion {
	type: "score";
	instructions: string | object;
	criteria: string[];
}

export interface NoulQuestion {
	type: "noul";
	instructions: string | object;
	criteria?: { true?: string; false?: string };
}

export type DecisionQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface ChoiceAnswer {
	type: "choice";
	choice: string;
	probabilities: Record<string, number>;
	confidence: number;
	rl_agent: { act_probability: number };
}

export interface ScoreAnswer {
	type: "score";
	score: number;
	legend: Record<string, string>;
	probabilities: Record<string, number>;
	confidence: number;
	rl_agent: { act_probability: number };
}

export interface NoulAnswer {
	type: "noul";
	/** P(true) */
	noul: number;
	rl_agent: { act_probability: number };
}

export type DecisionAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

/** Port implemented against `laya-api`, called by every consumer that needs a typed decision instead of generated text. */
export interface DecisionAgent {
	decide(
		state: unknown,
		questions: Record<string, DecisionQuestion>,
	): Promise<Record<string, DecisionAnswer>>;
}
