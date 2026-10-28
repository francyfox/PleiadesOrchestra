import { MinHeap } from "#core/goap/heap";
import type { Goal, GoapAction, WorldState } from "#core/goap/types";

/**
 * Fact interning: every distinct (key, value) pair seen in the goal and in the
 * actions' preconditions/effects gets a bit. A set of facts is then one
 * bigint, so "resolve + add preconditions" is AND/OR and the dedup signature
 * is the bigint itself (compared by value as a Map key) — no string building,
 * no sorting. Values are compared with `===` like the original, so any
 * string/number/boolean value works; a key holds one value at a time (a new
 * precondition replaces the old value of that key, as `Object.assign` did).
 */
class FactTable {
	private readonly byKey = new Map<string, Map<unknown, number>>();
	private readonly pairs: { key: string; value: unknown }[] = [];

	intern(key: string, value: unknown): number {
		let values = this.byKey.get(key);
		if (!values) {
			values = new Map();
			this.byKey.set(key, values);
		}
		let id = values.get(value);
		if (id === undefined) {
			id = this.pairs.length;
			this.pairs.push({ key, value });
			values.set(value, id);
		}
		return id;
	}

	get size(): number {
		return this.pairs.length;
	}

	/** Bits of every interned pair that has this key (whatever its value). */
	keyMask(key: string): bigint {
		let mask = 0n;
		for (const id of this.byKey.get(key)?.values() ?? [])
			mask |= 1n << BigInt(id);
		return mask;
	}

	maskOf(conditions: Partial<WorldState>): bigint {
		let mask = 0n;
		for (const [key, value] of Object.entries(conditions)) {
			mask |= 1n << BigInt(this.intern(key, value));
		}
		return mask;
	}

	/** Bits of interned pairs that `state` already satisfies. */
	satisfiedBy(state: WorldState): bigint {
		let mask = 0n;
		this.pairs.forEach(({ key, value }, id) => {
			if (state[key] === value) mask |= 1n << BigInt(id);
		});
		return mask;
	}

	/** Bits of interned pairs `effects` produces, incl. `undefined`-valued ones for absent keys (`effects[key] === undefined`). */
	effectMask(effects: Partial<WorldState>): bigint {
		let mask = this.maskOf(effects);
		this.pairs.forEach(({ key, value }, id) => {
			if (value === undefined && effects[key] === undefined)
				mask |= 1n << BigInt(id);
		});
		return mask;
	}
}

interface CompiledAction {
	action: GoapAction;
	effects: bigint;
	preconditions: bigint;
	/** Every pair of any key this action has a precondition on — cleared before the preconditions are set. */
	preconditionKeys: bigint;
}

interface FrontierNode {
	/** Facts still unresolved, working backward from the goal. */
	remaining: bigint;
	cost: number;
	/** Action chosen to reach this node and the node it came from; walking parents yields forward execution order. */
	action?: GoapAction;
	parent?: FrontierNode;
}

/**
 * Regressive (backward-chaining) GOAP search: starts from `goal` and walks
 * backward toward `state`, picking actions whose effects resolve currently
 * unsatisfied facts. Cheapest total-cost plan wins (uniform-cost search, not
 * plain BFS) — that's what makes the planner actually prefer a cheap Laya
 * classification over an expensive albedo generation when both would work,
 * per the plan doc's cost model. Frontier is a binary heap (FIFO among equal
 * costs, so ties resolve exactly as the old linear scan did); fact sets are
 * interned bitsets (see `FactTable`). `plan-reference.ts` keeps the old
 * implementation for equivalence tests and the benchmark.
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
	const table = new FactTable();
	const goalMask = table.maskOf(goal);
	if (goalMask === 0n) return [];

	for (const a of actions) {
		table.maskOf(a.preconditions);
		table.maskOf(a.effects);
	}
	const satisfied = table.satisfiedBy(state);
	const start = goalMask;
	if ((start & ~satisfied) === 0n) return [];

	const compiled: CompiledAction[] = actions.map((action) => {
		let preconditionKeys = 0n;
		for (const key of Object.keys(action.preconditions)) {
			preconditionKeys |= table.keyMask(key);
		}
		return {
			action,
			effects: table.effectMask(action.effects),
			preconditions: table.maskOf(action.preconditions),
			preconditionKeys,
		};
	});

	const frontier = new MinHeap<FrontierNode>();
	frontier.push({ remaining: start, cost: 0 }, 0);
	const bestCost = new Map<bigint, number>([[start, 0]]);

	for (let node = frontier.pop(); node; node = frontier.pop()) {
		// Stale entry — a cheaper path to this same `remaining` was already found.
		if (node.cost > (bestCost.get(node.remaining) ?? Infinity)) continue;

		if ((node.remaining & ~satisfied) === 0n) {
			const result: GoapAction[] = [];
			for (let n: FrontierNode | undefined = node; n?.action; n = n.parent) {
				result.push(n.action);
			}
			return result;
		}

		for (const candidate of compiled) {
			const resolved = candidate.effects & node.remaining;
			if (resolved === 0n) continue;

			const nextRemaining =
				(node.remaining & ~resolved & ~candidate.preconditionKeys) |
				candidate.preconditions;
			const nextCost = node.cost + candidate.action.cost;
			if (nextCost < (bestCost.get(nextRemaining) ?? Infinity)) {
				bestCost.set(nextRemaining, nextCost);
				frontier.push(
					{
						remaining: nextRemaining,
						cost: nextCost,
						action: candidate.action,
						parent: node,
					},
					nextCost,
				);
			}
		}
	}

	return undefined;
}
