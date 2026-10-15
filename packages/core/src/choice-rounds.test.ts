import { describe, expect, test } from "bun:test";
import {
	decideInRounds,
	estimateTokens,
	LAYA_HEAD_TOKENS,
	planChoiceRounds,
} from "./choice-rounds";
import type { DecisionAgent, DecisionQuestion } from "./decision-types";
import { LAYA_INTENT_DESCRIPTIONS } from "./goap/intent-taxonomy";
import {
	MESSAGE_INTENT_CRITERIA,
	MESSAGE_INTENT_INSTRUCTIONS,
} from "./goap/message-intent";
import { TOOL_INTENT_INSTRUCTIONS } from "./goap/webmcp-actions";

const crit = (n: number, text = "short text") =>
	Object.fromEntries(Array.from({ length: n }, (_, i) => [`opt${i}`, text]));

describe("planChoiceRounds", () => {
	test("a question that fits is one round with every option", () => {
		const plan = planChoiceRounds({ instructions: "Pick", criteria: crit(6) });
		expect(plan).toHaveLength(1);
		expect(plan[0]).toEqual(Object.keys(crit(6)));
	});

	test("more than maxOptions: the winner takes a slot of the next round", () => {
		const plan = planChoiceRounds({ instructions: "Pick", criteria: crit(12) });
		expect(plan[0]).toHaveLength(10);
		// next round = carried winner (1 slot) + the rest
		expect(plan[1]).toEqual(["opt10", "opt11"]);
		for (const [i, fresh] of plan.entries()) {
			expect(fresh.length + (i > 0 ? 1 : 0)).toBeLessThanOrEqual(10);
		}
	});

	test("the token budget splits rounds even under maxOptions", () => {
		const long = "x".repeat(150); // 50+ tokens each
		const plan = planChoiceRounds({
			instructions: "Pick",
			criteria: crit(6, long),
		});
		expect(plan.length).toBeGreaterThan(1);
		expect(plan.flat()).toEqual(Object.keys(crit(6)));
	});

	test("every option appears exactly once and each round advances", () => {
		const plan = planChoiceRounds({
			instructions: "Pick",
			criteria: crit(25, "y".repeat(90)),
			maxOptions: 5,
		});
		expect(plan.flat()).toEqual(Object.keys(crit(25, "y")));
		for (const fresh of plan) expect(fresh.length).toBeGreaterThan(0);
	});

	test("one oversized option still gets a round", () => {
		const plan = planChoiceRounds({
			instructions: "Pick",
			criteria: { a: "z".repeat(900), b: "ok" },
		});
		expect(plan.flat()).toEqual(["a", "b"]);
	});

	test("estimateTokens is conservative (chars / 3.5, rounded up)", () => {
		expect(estimateTokens("abcdefgh")).toBe(3);
	});
});

function fakeAgent(pick: (options: string[], call: number) => string) {
	const asked: string[][] = [];
	const agent: DecisionAgent = {
		async decide(_state, questions) {
			const q = Object.values(questions)[0] as DecisionQuestion & {
				criteria: Record<string, string>;
			};
			const options = Object.keys(q.criteria);
			asked.push(options);
			const key = Object.keys(questions)[0] as string;
			return {
				[key]: { type: "choice", choice: pick(options, asked.length - 1) },
			} as never;
		},
	};
	return { agent, asked };
}

describe("decideInRounds", () => {
	test("a small question is exactly one call", async () => {
		const { agent, asked } = fakeAgent((o) => o[2] as string);
		const result = await decideInRounds(
			agent,
			{ message: "hi" },
			{
				instructions: "Pick",
				criteria: crit(5),
			},
		);
		expect(asked).toHaveLength(1);
		expect(result.choice).toBe("opt2");
		expect(result.rounds).toEqual([
			{ options: asked[0] as string[], choice: "opt2" },
		]);
	});

	test("the winner joins the next round, last by default; final answer is the last winner", async () => {
		const { agent, asked } = fakeAgent((o, call) =>
			call === 0 ? "opt3" : (o[0] as string),
		);
		const result = await decideInRounds(
			agent,
			{ message: "hi" },
			{
				instructions: "Pick",
				criteria: crit(12),
			},
		);
		expect(asked).toHaveLength(2);
		expect(asked[1]).toEqual(["opt10", "opt11", "opt3"]);
		expect(result.choice).toBe("opt10");
		expect(result.rounds.map((r) => r.choice)).toEqual(["opt3", "opt10"]);
	});

	test("reports the probability of the winner, the lowest of all rounds", async () => {
		const agent: DecisionAgent = {
			async decide(_state, questions) {
				const keys = Object.keys(
					(questions.choice as { criteria: object }).criteria,
				);
				const first = keys.includes("opt0");
				return {
					choice: {
						type: "choice",
						choice: first ? "opt3" : "opt10",
						probabilities: { [first ? "opt3" : "opt10"]: first ? 0.7 : 0.9 },
					},
				};
			},
		};
		const result = await decideInRounds(
			agent,
			{ message: "hi" },
			{ instructions: "Pick", criteria: crit(12) },
		);
		expect(result.rounds.map((r) => r.probability)).toEqual([0.7, 0.9]);
		expect(result.probability).toBe(0.7);
	});

	test("carry first puts the winner at the front", async () => {
		const { agent, asked } = fakeAgent(() => "opt1");
		await decideInRounds(
			agent,
			{ message: "hi" },
			{
				instructions: "Pick",
				criteria: crit(12),
				carry: "first",
			},
		);
		expect(asked[1]).toEqual(["opt1", "opt10", "opt11"]);
	});

	test("a failing round propagates", async () => {
		const agent: DecisionAgent = {
			async decide() {
				throw new Error("down");
			},
		};
		await expect(
			decideInRounds(
				agent,
				{ message: "x" },
				{
					instructions: "Pick",
					criteria: crit(3),
				},
			),
		).rejects.toThrow("down");
	});

	test("an answer that is not one of the offered options ends with no choice", async () => {
		const { agent } = fakeAgent(() => "nonsense");
		const result = await decideInRounds(
			agent,
			{ message: "x" },
			{
				instructions: "Pick",
				criteria: crit(12),
			},
		);
		expect(result.choice).toBeUndefined();
	});
});

describe("the intent questions fit Laya's budget round by round", () => {
	const cases = [
		["message intent", MESSAGE_INTENT_INSTRUCTIONS, MESSAGE_INTENT_CRITERIA],
		["tool intent", TOOL_INTENT_INSTRUCTIONS, LAYA_INTENT_DESCRIPTIONS],
	] as const;
	for (const [name, instructions, criteria] of cases) {
		test(name, () => {
			const plan = planChoiceRounds({ instructions, criteria });
			const costOf = (key: string) =>
				1 + estimateTokens(`${key}: ${criteria[key]}`);
			const widest = Math.max(...Object.keys(criteria).map(costOf));
			expect(plan.flat()).toEqual(Object.keys(criteria));
			for (const [i, fresh] of plan.entries()) {
				const carried = i > 0 ? widest : 0;
				const used =
					2 +
					estimateTokens(`choice question: ${instructions}`) +
					carried +
					fresh.reduce((sum, key) => sum + costOf(key), 0);
				expect(used).toBeLessThanOrEqual(LAYA_HEAD_TOKENS);
				expect(fresh.length + (i > 0 ? 1 : 0)).toBeLessThanOrEqual(10);
			}
		});
	}
});
