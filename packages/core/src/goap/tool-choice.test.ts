import { describe, expect, test } from "bun:test";
import type { DecisionAgent } from "#core/decision-types";
import { askedOptions, chooseTool } from "#core/goap/tool-choice";
import { collectTokens, withChoiceReport } from "#core/usage-collector";

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

	test("each round of the tool question is recorded with its place", async () => {
		const many = Array.from({ length: 12 }, (_, i) => ({
			name: `tool_${i}`,
			description: `does thing number ${i}`,
		}));
		const inner = agent((options) => options[2] as string);
		const { tokens } = await collectTokens(() =>
			chooseTool({ decisionAgent: withChoiceReport(inner), tools: many }, "x"),
		);
		expect(tokens.choices?.map((c) => c.round)).toEqual([
			"group 1 of 2",
			"group 2 of 2",
			"final",
		]);
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

	describe("an intent the words give narrows the tools", () => {
		const adds = (name: string) => ({
			name,
			description: `Put things in the cart (${name}).`,
			effects: { inCart: true, [`toolResult:${name}`]: true },
		});

		test("only the tools of that intent are offered", async () => {
			const decisionAgent = agent(() => "add_to_cart");
			const verdict = await chooseTool(
				{
					decisionAgent,
					tools: [...tools, adds("add_to_cart"), adds("add_staples_to_cart")],
					intent: "addToCart",
				},
				"buy toilet paper",
			);
			expect(verdict).toMatchObject({ kind: "tool", tool: "add_to_cart" });
			expect(decisionAgent.asked.flat()).toContain("add_staples_to_cart");
			expect(decisionAgent.asked.flat()).not.toContain("get_cart");
		});

		test("one tool of that intent is the answer without asking the model", async () => {
			const decisionAgent = agent(() => "get_cart");
			expect(
				await chooseTool(
					{
						decisionAgent,
						tools: [...tools, adds("add_to_cart")],
						intent: "addToCart",
					},
					"buy toilet paper",
				),
			).toEqual({ kind: "tool", tool: "add_to_cart", via: "words" });
			expect(decisionAgent.asked).toHaveLength(0);
		});

		test("an intent no tool has keeps every tool on offer", async () => {
			const decisionAgent = agent(() => "get_cart");
			await chooseTool(
				{ decisionAgent, tools, intent: "addToCart" },
				"buy toilet paper",
			);
			expect(decisionAgent.asked.flat()).toContain("set_pizza_size");
		});
	});

	describe("the groups read names, the last round reads descriptions", () => {
		const staples = {
			name: "add_staples_to_cart",
			description:
				"Put the shopper's saved staples in the cart. Use it when they ask for their staples or 'the usual'.",
		};
		const add = {
			name: "add_to_cart",
			description: "Add a product to the cart.",
		};
		/** Keeps every round's tool texts (without chat/other). */
		const reading = (pick: (options: string[]) => string) => {
			const texts: Record<string, string>[] = [];
			const decisionAgent: DecisionAgent = {
				async decide(_state, questions) {
					const [key, question] = Object.entries(questions)[0] as [
						string,
						{ type: string; criteria: Record<string, string> },
					];
					const { chat: _c, other: _o, ...tools } = question.criteria;
					texts.push(tools);
					const choice = pick(Object.keys(question.criteria));
					return {
						[key]: { type: "choice", choice, probabilities: { [choice]: 0.9 } },
					};
				},
			};
			return { decisionAgent, texts };
		};

		test("one round: every tool with its description", async () => {
			const { decisionAgent, texts } = reading(() => "add_to_cart");
			await chooseTool(
				{ decisionAgent, tools: [add, staples] },
				"buy toilet paper",
			);
			expect(texts).toEqual([
				{
					add_to_cart: "add to cart: Add a product to the cart.",
					add_staples_to_cart: `add staples to cart: ${staples.description}`,
				},
			]);
		});

		test("groups: names only; the final between their winners: with descriptions", async () => {
			const many = [
				add,
				...Array.from({ length: 8 }, (_, i) => ({
					name: `tool_${i}`,
					description: `does thing number ${i}`,
				})),
				staples,
			];
			const { decisionAgent, texts } = reading((options) =>
				options.includes("add_to_cart")
					? "add_to_cart"
					: options.includes("add_staples_to_cart")
						? "add_staples_to_cart"
						: "other",
			);
			await chooseTool({ decisionAgent, tools: many }, "buy toilet paper");
			expect(texts[0]?.add_to_cart).toBe("add to cart");
			expect(texts.at(-1)).toEqual({
				add_to_cart: "add to cart: Add a product to the cart.",
				add_staples_to_cart: `add staples to cart: ${staples.description}`,
			});
		});

		test("a long description is cut", async () => {
			const { decisionAgent, texts } = reading(() => "add_to_cart");
			await chooseTool(
				{
					decisionAgent,
					tools: [{ ...add, description: "word ".repeat(200) }, staples],
				},
				"buy",
			);
			expect(texts[0]?.add_to_cart?.length).toBeLessThanOrEqual(250);
			expect(texts[0]?.add_to_cart?.endsWith("…")).toBe(true);
		});
	});
});

describe("askedOptions: a question about what a tool offers is answered from its schema", () => {
	const setSize = {
		name: "set_pizza_size",
		effects: { "toolResult:set_pizza_size": true },
		options: { size: ["Small", "Medium", "Large"] },
	};
	function asking(probability: number) {
		const asked: string[] = [];
		const decisionAgent: DecisionAgent = {
			async decide(state, questions) {
				asked.push(String((state as { message: string }).message));
				const id = Object.keys(questions)[0] as string;
				return { [id]: { type: "boolean", probability } };
			},
		};
		return { decisionAgent, asked };
	}

	test("a question gets the options, a request does not", async () => {
		const yes = asking(0.8);
		expect(await askedOptions(yes, setSize, "what sizes are there?")).toEqual({
			size: ["Small", "Medium", "Large"],
		});
		expect(yes.asked).toEqual(["what sizes are there?"]);
		const no = asking(0.3);
		expect(await askedOptions(no, setSize, "make it large")).toBeUndefined();
	});

	test("no model call for a tool without options or one that only reads", async () => {
		const yes = asking(0.9);
		expect(
			await askedOptions(
				yes,
				{ name: "share_pizza", effects: {} },
				"how do I share it?",
			),
		).toBeUndefined();
		expect(
			await askedOptions(
				yes,
				{
					name: "search_products",
					effects: { catalogSearched: true },
					options: { department: ["Dairy", "Bakery"] },
				},
				"do you have tomatoes?",
			),
		).toBeUndefined();
		expect(yes.asked).toHaveLength(0);
	});
});
