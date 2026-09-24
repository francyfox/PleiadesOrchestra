import type { Goal, GoapAction, WorldState } from "./types";

type Subgoal = Partial<WorldState>;

/** Facts in `conditions` not already true in `state`. */
function unsatisfied(conditions: Subgoal, state: WorldState): Subgoal {
	const result: Subgoal = {};
	for (const [key, value] of Object.entries(conditions)) {
		if (state[key] !== value) result[key] = value;
	}
	return result;
}

/** Stable signature for dedup — key order must not affect equality. */
function signature(conditions: Subgoal): string {
	return JSON.stringify(
		Object.entries(conditions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	);
}

interface FrontierNode {
	/** Facts still unresolved, working backward from the goal. */
	remaining: Subgoal;
	cost: number;
	/** Actions chosen so far, in backward (goal-to-state) order. */
	pathBackward: GoapAction[];
}

/**
 * Regressive (backward-chaining) GOAP search: starts from `goal` and walks
 * backward toward `state`, picking actions whose effects resolve currently
 * unsatisfied facts. Cheapest total-cost plan wins (uniform-cost search, not
 * plain BFS) — that's what makes the planner actually prefer a cheap Laya
 * classification over an expensive albedo generation when both would work,
 * per the plan doc's cost model. A plain linear-scan frontier, not a real
 * heap: the action set this targets is small (~15-20), not worth a
 * priority-queue dependency for that size.
 *
 * Assumes no interference between actions' effects (standard STRIPS
 * regression simplification) — reality diverging from that is what the
 * Phase 2 replanning executor is for, not this function.
 */
export function plan(
	state: WorldState,
	goal: Goal,
	actions: GoapAction[],
): GoapAction[] | undefined {
	const startRemaining = unsatisfied(goal, state);
	if (Object.keys(startRemaining).length === 0) return [];

	const frontier: FrontierNode[] = [
		{ remaining: startRemaining, cost: 0, pathBackward: [] },
	];
	const bestCost = new Map<string, number>([[signature(startRemaining), 0]]);

	while (frontier.length > 0) {
		let bestIndex = 0;
		for (let i = 1; i < frontier.length; i++) {
			const current = frontier[i];
			const champion = frontier[bestIndex];
			if (current && champion && current.cost < champion.cost) {
				bestIndex = i;
			}
		}
		const node = frontier.splice(bestIndex, 1)[0];
		if (!node) break;

		// Stale entry — a cheaper path to this same `remaining` was already found.
		if (node.cost > (bestCost.get(signature(node.remaining)) ?? Infinity)) {
			continue;
		}

		if (Object.keys(unsatisfied(node.remaining, state)).length === 0) {
			return [...node.pathBackward].reverse();
		}

		for (const candidate of actions) {
			const resolvedKeys = Object.keys(node.remaining).filter(
				(key) => candidate.effects[key] === node.remaining[key],
			);
			if (resolvedKeys.length === 0) continue;

			const nextRemaining: Subgoal = { ...node.remaining };
			for (const key of resolvedKeys) delete nextRemaining[key];
			Object.assign(nextRemaining, candidate.preconditions);

			const nextCost = node.cost + candidate.cost;
			const sig = signature(nextRemaining);
			if (nextCost < (bestCost.get(sig) ?? Infinity)) {
				bestCost.set(sig, nextCost);
				frontier.push({
					remaining: nextRemaining,
					cost: nextCost,
					pathBackward: [...node.pathBackward, candidate],
				});
			}
		}
	}

	return undefined;
}
