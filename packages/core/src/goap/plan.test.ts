import { describe, expect, test } from "bun:test";
import { plan } from "./plan.ts";
import type { GoapAction } from "./types.ts";

/** Test fixture: `execute` is never called by `plan()` — it's a no-op stub to satisfy the type. */
function action(
	name: string,
	cost: number,
	preconditions: GoapAction["preconditions"],
	effects: GoapAction["effects"],
): GoapAction {
	return {
		name,
		cost,
		preconditions,
		effects,
		execute: async () => ({}),
	};
}

describe("plan", () => {
	test("returns an empty plan when the goal is already empty", () => {
		expect(plan({}, {}, [])).toEqual([]);
	});

	test("returns an empty plan when the goal is already satisfied by state", () => {
		const result = plan({ replied: true }, { replied: true }, [
			action("reply", 1, {}, { replied: true }),
		]);
		expect(result).toEqual([]);
	});

	test("returns a single action that directly satisfies the goal", () => {
		const reply = action("reply", 1, {}, { replied: true });
		const result = plan({}, { replied: true }, [reply]);
		expect(result).toEqual([reply]);
	});

	test("chains actions in correct forward execution order", () => {
		// generateReply needs `intent` classified first — classifyIntent has no
		// preconditions, so the plan must run it before generateReply, not after.
		const classifyIntent = action("classifyIntent", 1, {}, { intent: "buy" });
		const generateReply = action(
			"generateReply",
			5,
			{ intent: "buy" },
			{ replied: true },
		);

		const result = plan({}, { replied: true }, [generateReply, classifyIntent]);

		expect(result).toEqual([classifyIntent, generateReply]);
	});

	test("picks the cheaper of two actions that both satisfy the goal directly", () => {
		const cheap = action("cheapReply", 1, {}, { replied: true });
		const expensive = action("expensiveReply", 100, {}, { replied: true });

		const result = plan({}, { replied: true }, [expensive, cheap]);

		expect(result).toEqual([cheap]);
	});

	test("picks a cheaper multi-action chain over a pricier single action", () => {
		const expensiveDirect = action("expensiveDirect", 10, {}, { x: true });
		const cheapStepA = action("cheapStepA", 3, {}, { y: true });
		const cheapStepB = action("cheapStepB", 3, { y: true }, { x: true });

		const result = plan({}, { x: true }, [
			expensiveDirect,
			cheapStepB,
			cheapStepA,
		]);

		expect(result).toEqual([cheapStepA, cheapStepB]);
	});

	test("returns undefined when no combination of actions reaches the goal", () => {
		const unrelated = action("unrelated", 1, {}, { somethingElse: true });
		const result = plan({}, { replied: true }, [unrelated]);
		expect(result).toBeUndefined();
	});

	test("does not hang on a cyclic action graph with no path to the goal", () => {
		// a's precondition is satisfied by b's effect and vice versa — a cycle
		// that never actually reaches `replied: true`.
		const a = action("a", 1, { b: true }, { a: true });
		const b = action("b", 1, { a: true }, { b: true });

		const result = plan({}, { replied: true }, [a, b]);

		expect(result).toBeUndefined();
	});

	test("only includes preconditions not already true in the starting state", () => {
		// `authenticated` is already true, so the plan shouldn't include any
		// action to re-establish it, even though an action for it exists.
		const authenticate = action("authenticate", 5, {}, { authenticated: true });
		const search = action(
			"search",
			2,
			{ authenticated: true },
			{ searched: true },
		);

		const result = plan({ authenticated: true }, { searched: true }, [
			authenticate,
			search,
		]);

		expect(result).toEqual([search]);
	});
});
