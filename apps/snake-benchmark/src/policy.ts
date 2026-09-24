/**
 * Laya's side of a move, ported from mizorewww/laya-mlx
 * `laya_mlx/snake/policy.py` (Apache-2.0): one `systemOne` call per move
 * with three questions, plus the optional cycle safety shield.
 */
import { DIRECTIONS, type Direction, type SnakeGame } from "./game.ts";

export type PromptStyle = "compact" | "detailed";

// A type alias, not an interface: only aliases are assignable to Laya's
// `Record<string, Question>` (interfaces lack an implicit index signature).
export type SnakeQuestions = {
	move: {
		type: "choice";
		instructions: string;
		criteria: Record<Direction, string>;
	};
	risk: { type: "noul"; instructions: string };
	food: { type: "noul"; instructions: string };
};

/** The slice of `Laya.systemOne` the policy needs — injectable for tests. */
export type DecideFn = (
	state: string,
	questions: SnakeQuestions,
) => Promise<{
	move: { probabilities: Record<string, number> };
	risk: { noul: number };
	food: { noul: number };
}>;

export function buildRequest(
	game: SnakeGame,
	prompt: PromptStyle,
): { state: string; questions: SnakeQuestions; plannerBest: string } {
	const moves = game.moves();
	const safe = moves.filter((m) => m.safe);
	const preferred = safe.reduce<(typeof safe)[number] | undefined>(
		(best, m) => (best === undefined || m.advance > best.advance ? m : best),
		undefined,
	)?.direction;
	const { reachable, space } = game.foodReachability();
	const yesNo = (value: boolean) => (value ? "yes" : "no");

	const criteria = {} as Record<Direction, string>;
	for (const m of moves) {
		criteria[m.direction] =
			prompt === "compact"
				? !m.legal
					? "Blocked. Collision."
					: !m.safe
						? "Unsafe. Traps the snake."
						: m.eats
							? "Safe. Eat food now. Best."
							: m.direction === preferred
								? "Safe. Best route to food."
								: "Safe. Slower route."
				: !m.legal
					? `Collision: ${m.reason}. Unsafe.`
					: !m.safe
						? "Unsafe route. Risk of trapping the snake."
						: m.eats
							? "Safe. Eat the food immediately. Best move."
							: m.direction === preferred
								? "Safe. Best progress toward food."
								: "Safe but less progress toward food.";
	}

	if (prompt === "compact") {
		return {
			state: `Safe route: ${yesNo(safe.length > 0)}. Food reachable through empty cells: ${yesNo(reachable)}.`,
			questions: {
				move: {
					type: "choice",
					instructions: "Choose the best safe move toward food.",
					criteria,
				},
				risk: { type: "noul", instructions: "Is a safe route available?" },
				food: {
					type: "noul",
					instructions: "Is food reachable through empty cells?",
				},
			},
			plannerBest: preferred ?? "NONE",
		};
	}
	return {
		state:
			`Snake game. ${safe.length} safe directions available. ` +
			`Food reachable through empty cells: ${yesNo(reachable)}. ` +
			`Open cells: ${space}. Snake length: ${game.body.length}. ` +
			(safe.length > 0
				? "There is a safe route forward."
				: "The snake is trapped."),
		questions: {
			move: {
				type: "choice",
				instructions:
					"Select the safest move with best progress toward food. Avoid collisions.",
				criteria,
			},
			risk: {
				type: "noul",
				instructions: "Is there a safe route forward for the snake?",
			},
			food: {
				type: "noul",
				instructions: "Is food reachable through the currently empty cells?",
			},
		},
		plannerBest: preferred ?? "NONE",
	};
}

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

export async function decide(
	laya: DecideFn,
	game: SnakeGame,
	options: { guarded: boolean; prompt: PromptStyle },
): Promise<Decision> {
	const started = performance.now();
	const safeDirections = game
		.moves()
		.filter((m) => m.safe)
		.map((m) => m.direction);
	if (safeDirections.length === 0 && options.guarded) {
		throw new Error("Cycle safety invariant violated: no safe action");
	}
	const { state, questions, plannerBest } = buildRequest(game, options.prompt);

	const inferenceStart = performance.now();
	const answers = await laya(state, questions);
	const inferenceMs = performance.now() - inferenceStart;

	const probabilities = {} as Record<Direction, number>;
	for (const d of DIRECTIONS)
		probabilities[d] = answers.move.probabilities[d] ?? 0;
	const scores = [
		...Object.values(probabilities),
		answers.risk.noul,
		answers.food.noul,
	];
	if (scores.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
		throw new Error("Model returned an invalid probability; no move executed");
	}

	const byProbability = (a: Direction, b: Direction) =>
		probabilities[b] - probabilities[a];
	const proposed = [...DIRECTIONS].sort(byProbability)[0] as Direction;
	const executed =
		options.guarded && !safeDirections.includes(proposed)
			? ([...safeDirections].sort(byProbability)[0] as Direction)
			: proposed;

	return {
		probabilities,
		proposed,
		executed,
		safeDirections,
		intervened: proposed !== executed,
		deadEndRisk: 1 - answers.risk.noul,
		foodReachable: answers.food.noul,
		inferenceMs,
		decisionMs: performance.now() - started,
		plannerBest,
	};
}
