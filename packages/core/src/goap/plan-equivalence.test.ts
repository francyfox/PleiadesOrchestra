import { describe, expect, test } from "bun:test";
import { plan } from "#core/goap/plan";
import { planReference } from "#core/goap/plan-reference";
import type { GoapAction, WorldState } from "#core/goap/types";

function lcg(seed: number) {
	let s = seed;
	return (n: number) => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s % n;
	};
}

const VALUES = [true, false, 1, 2, "buy", "browse", undefined];

function randomFacts(rnd: (n: number) => number, max: number): WorldState {
	const facts: WorldState = {};
	const count = rnd(max + 1);
	for (let i = 0; i < count; i++) {
		facts[`k${rnd(8)}`] = VALUES[rnd(VALUES.length)];
	}
	return facts;
}

describe("plan() equals the reference planner", () => {
	test("same plan (identity and order) on random action sets, mixed value types", () => {
		for (let seed = 1; seed <= 400; seed++) {
			const rnd = lcg(seed);
			const actions: GoapAction[] = Array.from(
				{ length: 3 + rnd(12) },
				(_, i) => ({
					name: `a${i}`,
					cost: 1 + rnd(4),
					preconditions: randomFacts(rnd, 3),
					effects: randomFacts(rnd, 3),
					execute: async () => ({}),
				}),
			);
			const state = randomFacts(rnd, 4);
			const goal = randomFacts(rnd, 3);

			const expected = planReference(state, goal, actions);
			const actual = plan(state, goal, actions);
			if (expected === undefined) expect(actual).toBeUndefined();
			else {
				expect(actual?.length).toBe(expected.length);
				expected.forEach((a, i) => {
					expect(actual?.[i]).toBe(a);
				});
			}
		}
	});

	test("equal-cost alternatives resolve in declaration order, like before", () => {
		const mk = (name: string): GoapAction => ({
			name,
			cost: 1,
			preconditions: {},
			effects: { done: true },
			execute: async () => ({}),
		});
		const [first, second] = [mk("first"), mk("second")];
		expect(plan({}, { done: true }, [first, second])).toEqual([first]);
		expect(planReference({}, { done: true }, [first, second])).toEqual([first]);
	});

	test("a later precondition replaces an earlier value of the same key", () => {
		const setMode = (value: string): GoapAction => ({
			name: `mode-${value}`,
			cost: 1,
			preconditions: {},
			effects: { mode: value },
			execute: async () => ({}),
		});
		const finish: GoapAction = {
			name: "finish",
			cost: 1,
			preconditions: { mode: "b" },
			effects: { done: true },
			execute: async () => ({}),
		};
		const actions = [setMode("a"), setMode("b"), finish];
		const goal = { done: true, mode: "a" } as const;
		const names = (r?: GoapAction[]) => r?.map((a) => a.name);
		expect(names(plan({}, goal, actions))).toEqual(
			names(planReference({}, goal, actions)),
		);
	});
});
