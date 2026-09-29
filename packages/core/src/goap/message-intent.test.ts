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
	test("returns the classified tool intent for a task-shaped message", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("addToCart"));

		const intent = await classifyMessageIntent(
			{ decisionAgent },
			"добавь самый дешёвый ноутбук в корзину",
		);

		expect(intent).toBe("addToCart");
	});

	test("passes the message through and offers chat plus every tool intent as criteria", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("chat"));

		await classifyMessageIntent({ decisionAgent }, "привет");

		expect(decisionAgent.capturedState).toEqual({ message: "привет" });
		expect(decisionAgent.capturedCriteria).toContain("chat");
		expect(decisionAgent.capturedCriteria).toContain("addToCart");
	});

	test("falls back to chat when decide() doesn't answer the question", async () => {
		const decisionAgent = fakeDecisionAgent(undefined);

		const intent = await classifyMessageIntent({ decisionAgent }, "hi");

		expect(intent).toBe("chat");
	});

	test("falls back to chat when decide() answers with a value outside the taxonomy", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("nonsense"));

		const intent = await classifyMessageIntent({ decisionAgent }, "hi");

		expect(intent).toBe("chat");
	});

	test("falls back to chat when decide() answers with a non-choice type", async () => {
		const decisionAgent = fakeDecisionAgent({
			type: "noul",
			noul: 0.9,
			rl_agent: { act_probability: 1 },
		});

		const intent = await classifyMessageIntent({ decisionAgent }, "hi");

		expect(intent).toBe("chat");
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
