import type {
	Experimental_DecisionAnswer,
	Experimental_DecisionQuestion,
	Experimental_DecisionState,
} from "ai";

/**
 * Typed-decision shapes of a Laya-style "System-1" model, taken straight from
 * the Vercel AI SDK's experimental decision API (`experimental_decide`) so
 * there is one vocabulary from the wire to the GOAP actions. A boolean
 * question's answer is `{ probability }` = P(true).
 */
export type DecisionState = Experimental_DecisionState;
export type DecisionQuestion = Experimental_DecisionQuestion;
export type DecisionAnswer = Experimental_DecisionAnswer<DecisionQuestion>;

export type ChoiceAnswer = Extract<DecisionAnswer, { type: "choice" }>;
export type ScoreAnswer = Extract<DecisionAnswer, { type: "score" }>;
export type BooleanAnswer = Extract<DecisionAnswer, { type: "boolean" }>;

/** Port implemented against `gamma-decision`, called by every consumer that needs a typed decision instead of generated text. */
export interface DecisionAgent {
	decide(
		state: DecisionState,
		questions: Record<string, DecisionQuestion>,
	): Promise<Record<string, DecisionAnswer>>;
}
