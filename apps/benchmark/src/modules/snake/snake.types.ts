import type { DecisionAnswer } from "@repo/core";
import type { Direction } from "./snake.ts";

export type PromptStyle = "compact" | "detailed";

// A type alias, not an interface: only aliases are assignable to
// `Record<string, DecisionQuestion>` (interfaces lack an implicit index signature).
export type SnakeQuestions = {
	move: {
		type: "choice";
		instructions: string;
		criteria: Record<Direction, string>;
	};
	risk: { type: "boolean"; instructions: string };
	food: { type: "boolean"; instructions: string };
};

/** The slice of `LoadedLaya.decide` the policy needs — injectable for tests. */
export type DecideFn = (
	state: string,
	questions: SnakeQuestions,
) => Promise<Record<string, DecisionAnswer>>;

export interface Decision {
	probabilities: Record<Direction, number>;
	proposed: Direction;
	executed: Direction;
	safeDirections: Direction[];
	/** The shield replaced the model's first choice. */
	intervened: boolean;
	/** 1 − P(safe route available). A model output, not a calibrated death probability. */
	deadEndRisk: number;
	foodReachable: number;
	/** Wall time of the Laya call alone. */
	inferenceMs: number;
	/** Planner + Laya call + shield. */
	decisionMs: number;
	plannerBest: string;
}
