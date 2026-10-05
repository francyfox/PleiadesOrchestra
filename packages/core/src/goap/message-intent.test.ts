import { describe, expect, test } from "bun:test";
import type { DecisionAgent, DecisionAnswer } from "../decision-types.ts";
import { classifyMessageIntent, goalForIntent } from "./message-intent.ts";
import type { GoapAction } from "./types.ts";

function fakeDecisionAgent(
	answer: DecisionAnswer | undefined,
): DecisionAgent & { capturedState?: unknown; capturedCriteria?: unknown } {
	const agent: DecisionAgent & {
		capturedState?: unknown;
		capturedCriteria?: unknown;
	} = {
		async decide(state, questions) {
			agent.capturedState = state;
			const question = questions.intent;
			agent.capturedCriteria =
				question?.type === "choice" ? question.criteria : undefined;
			const result: Record<string, DecisionAnswer> = {};
			if (answer) result.intent = answer;
			return result;
		},
	};
	return agent;
}

function choiceAnswer(choice: string): DecisionAnswer {
	return {
		type: "choice",
		choice,
		probabilities: { [choice]: 1 },
		confidence: 1,
		rl_agent: { act_probability: 1 },
	};
}

describe("classifyMessageIntent", () => {
	test("returns Laya's tool intent for a message no word decides", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("addToCart"));

		const intent = await classifyMessageIntent(
			{ decisionAgent },
			"ноутбук, пожалуйста",
		);

		expect(intent).toBe("addToCart");
	});

	test("passes only the message through (no page, no language) and offers chat plus every tool intent as criteria", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("chat"));

		// No lexical cue in it: Laya decides.
		await classifyMessageIntent(
			{ decisionAgent },
			"сколько будет два плюс два?",
		);

		// The page the visitor is on used to be sent along; Laya then answered
		// "привет" with `navigate` and «купи 1 сыр» with `checkout`.
		expect(decisionAgent.capturedState).toEqual({
			message: "сколько будет два плюс два?",
		});
		// Described options, not bare labels: Laya mixed "go to the market" up with checkout.
		const criteria = decisionAgent.capturedCriteria as Record<string, string>;
		expect(Object.keys(criteria)).toContain("chat");
		expect(Object.keys(criteria)).toContain("addToCart");
		expect(Object.keys(criteria)).toContain("chooseStore");
		expect(criteria.chooseStore).toContain("store");
	});

	test("a message whose words say what it wants is sorted without asking Laya", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("removeFromCart"));

		const intent = await classifyMessageIntent({ decisionAgent }, "купи 1 сыр");

		expect(intent).toBe("addToCart");
		expect(decisionAgent.capturedState).toBeUndefined();
	});

	test("Laya alone can never start a checkout or empty the cart: those need the words for it", async () => {
		for (const risky of ["checkout", "removeFromCart"]) {
			const decisionAgent = fakeDecisionAgent(choiceAnswer(risky));

			// Nothing in this message asks for either.
			const intent = await classifyMessageIntent(
				{ decisionAgent },
				"сколько будет два плюс два?",
			);

			expect(intent).toBe("chat");
		}
	});

	test("Laya's other answers stand when no word decides", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("search"));

		const intent = await classifyMessageIntent(
			{ decisionAgent },
			"что-нибудь вкусное к чаю",
		);

		expect(intent).toBe("search");
	});

	test("cues: false asks Laya for everything (to measure it alone)", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("search"));

		const intent = await classifyMessageIntent(
			{ decisionAgent, cues: false },
			"купи 1 сыр",
		);

		expect(intent).toBe("search");
	});

	test("falls back to chat when decide() doesn't answer the question", async () => {
		const decisionAgent = fakeDecisionAgent(undefined);

		const intent = await classifyMessageIntent({ decisionAgent }, "hmm");

		expect(intent).toBe("chat");
	});

	test("falls back to chat when decide() answers with a value outside the taxonomy", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("nonsense"));

		const intent = await classifyMessageIntent({ decisionAgent }, "hmm");

		expect(intent).toBe("chat");
	});

	test("falls back to chat when decide() answers with a non-choice type", async () => {
		const decisionAgent = fakeDecisionAgent({
			type: "noul",
			noul: 0.9,
			rl_agent: { act_probability: 1 },
		});

		const intent = await classifyMessageIntent({ decisionAgent }, "hmm");

		expect(intent).toBe("chat");
	});
});

describe("classifyMessageIntent with an English translation", () => {
	test("Laya is given the English text, not the original", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("search"));

		const intent = await classifyMessageIntent(
			{ decisionAgent },
			"ноутбук, пожалуйста",
			"a laptop, please",
		);

		expect(intent).toBe("search");
		expect(decisionAgent.capturedState).toEqual({
			message: "a laptop, please",
		});
	});

	test("the words of the original still decide first (a translation can lose them: «оформи заказ» → «Order»)", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("search"));

		expect(
			await classifyMessageIntent({ decisionAgent }, "оформи заказ", "Order"),
		).toBe("checkout");
		expect(decisionAgent.capturedState).toBeUndefined();
	});

	test("and the words of the translation decide when the original has none", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("search"));

		expect(
			await classifyMessageIntent(
				{ decisionAgent },
				"мне бы ноутбук подешевле, если можно",
				"I'd like to buy a laptop, if possible",
			),
		).toBe("addToCart");
		expect(decisionAgent.capturedState).toBeUndefined();
	});
});

describe("goalForIntent", () => {
	const baseGoal = { replied: true };

	test("chat intent never extends the base goal, regardless of the catalog", () => {
		const goal = goalForIntent("chat", baseGoal, []);

		expect(goal).toEqual({ replied: true });
	});

	test("a task intent with no matching action in the catalog degrades to the base goal", () => {
		const goal = goalForIntent("addToCart", baseGoal, [
			{
				name: "generateReply",
				cost: 5,
				preconditions: {},
				effects: { replied: true },
				execute: async () => ({}),
			},
		]);

		expect(goal).toEqual({ replied: true });
	});

	test("a task intent extends the goal with the effect an available action can actually produce", () => {
		const addToCart: GoapAction = {
			name: "cartTool",
			cost: 3,
			preconditions: {},
			effects: { inCart: true },
			execute: async () => ({}),
		};

		const goal = goalForIntent("addToCart", baseGoal, [addToCart]);

		expect(goal).toEqual({ replied: true, inCart: true });
	});

	test("an intent with no effects (e.g. paginate) never extends the goal, even with a matching action name", () => {
		const paginate: GoapAction = {
			name: "paginateTool",
			cost: 1,
			preconditions: {},
			effects: {},
			execute: async () => ({}),
		};

		const goal = goalForIntent("paginate", baseGoal, [paginate]);

		expect(goal).toEqual({ replied: true });
	});
});
