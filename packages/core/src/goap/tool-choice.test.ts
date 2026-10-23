import { describe, expect, test } from "bun:test";
import type { DecisionAgent } from "../decision-types";
import { chooseTool } from "./tool-choice";

/** Answers every choice question with `pick(options)`, and keeps what it was asked. */
function agent(
	pick: (options: string[]) => string,
	probability = 0.9,
): DecisionAgent & { asked: string[][] } {
	const asked: string[][] = [];
	return {
		asked,
		async decide(_state, questions) {
			const question = Object.values(questions)[0];
			if (question?.type !== "choice") throw new Error("choice expected");
			const options = Object.keys(question.criteria);
			asked.push(options);
			const choice = pick(options);
			return {
				[Object.keys(questions)[0] as string]: {
					type: "choice",
					choice,
					probabilities: { [choice]: probability },
				},
			};
		},
	};
}

const tools = [
	{ name: "get_cart", description: "Read what is in the cart. Takes nothing." },
	{ name: "set_pizza_size", description: "Change the size of a pizza." },
	{ name: "clear_cart", description: "Remove everything from the cart." },
	{ name: "checkout", description: "Pay and place the order." },
];

describe("chooseTool", () => {
	test("a tool of the site is the answer, even one no shop intent covers", async () => {
		const decisionAgent = agent(() => "set_pizza_size");
		expect(
			await chooseTool({ decisionAgent, tools }, "make the pizza bigger"),
		).toEqual({ kind: "tool", tool: "set_pizza_size", confidence: 0.9 });
	});

	test("dangerous tools are never offered: their words decide, not a model", async () => {
		const decisionAgent = agent(() => "get_cart");
		await chooseTool({ decisionAgent, tools }, "what is in my cart");
		expect(decisionAgent.asked.flat()).not.toContain("clear_cart");
		expect(decisionAgent.asked.flat()).not.toContain("checkout");
		expect(decisionAgent.asked.flat()).toContain("get_cart");
	});

	test("`other`, or a winner below the threshold, is unclear instead of a random tool", async () => {
		expect(
			await chooseTool({ decisionAgent: agent(() => "other"), tools }, "hmm"),
		).toMatchObject({ kind: "unclear" });
		expect(
			await chooseTool(
				{ decisionAgent: agent(() => "get_cart", 0.3), tools, threshold: 0.5 },
				"hmm",
			),
		).toMatchObject({ kind: "unclear" });
	});

	test("small talk is chat; an answer that is no option at all is unclear", async () => {
		expect(
			await chooseTool({ decisionAgent: agent(() => "chat"), tools }, "hi"),
		).toMatchObject({ kind: "chat" });
		expect(
			await chooseTool({ decisionAgent: agent(() => "teleport"), tools }, "hi"),
		).toMatchObject({ kind: "unclear" });
	});

	test("many tools are asked in rounds of at most 10 options", async () => {
		const many = Array.from({ length: 25 }, (_, i) => ({
			name: `tool_${i}`,
			description: `does thing number ${i}`,
		}));
		// The winner of a round is carried into the next: tool_24 only shows up in the last one.
		const decisionAgent = agent((options) =>
			options.includes("tool_24") ? "tool_24" : (options[0] as string),
		);
		const verdict = await chooseTool({ decisionAgent, tools: many }, "x");
		expect(verdict).toMatchObject({ kind: "tool", tool: "tool_24" });
		expect(decisionAgent.asked.length).toBeGreaterThan(1);
		for (const round of decisionAgent.asked) {
			expect(round.length).toBeLessThanOrEqual(10);
		}
	});

	test("the right tool of an early group is not lost to the options of later groups", async () => {
		const many = [
			{ name: "search_products", description: "Search the catalog." },
			...Array.from({ length: 20 }, (_, i) => ({
				name: `tool_${i}`,
				description: `does thing number ${i}`,
			})),
		];
		// Only the group that holds search_products has anything for the message.
		const decisionAgent = agent((options) =>
			options.includes("search_products") ? "search_products" : "other",
		);
		expect(
			await chooseTool({ decisionAgent, tools: many }, "find sneakers"),
		).toMatchObject({ kind: "tool", tool: "search_products" });
	});
});
