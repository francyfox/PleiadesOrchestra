import { describe, expect, test } from "bun:test";
import type { DecisionAgent, DecisionAnswer } from "#core/decision-types";
import {
	classifyMessageIntent,
	classifyMessageIntentDetailed,
	goalForIntent,
} from "#core/goap/message-intent";
import type { GoapAction } from "#core/goap/types";

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
			// The question is asked in rounds: keep every option seen in any of them.
			agent.capturedCriteria = {
				...(agent.capturedCriteria as object | undefined),
				...(question?.type === "choice" ? question.criteria : undefined),
			};
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
	};
}

describe("classifyMessageIntentDetailed", () => {
	const hit = (intent: "addToCart" | "chat") => ({
		intent,
		via: "model" as const,
		confidence: 0.97,
	});

	test("what the site's memory knows is answered without asking Laya", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("search"));
		const asked: string[] = [];

		const verdict = await classifyMessageIntentDetailed(
			{
				decisionAgent,
				rules: "guarded",
				memory: (text) => {
					asked.push(text);
					return hit("addToCart");
				},
			},
			"положи куртку в корзину",
			"put the jacket in the cart",
		);

		expect(verdict).toEqual({
			intent: "addToCart",
			source: "memory",
			confidence: 0.97,
		});
		// The memory is asked about the English text, as Laya would be.
		expect(asked).toEqual(["put the jacket in the cart"]);
		expect(decisionAgent.capturedState).toBeUndefined();
	});

	test("without a memory answer Laya decides, and the verdict says so", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("search"));

		const verdict = await classifyMessageIntentDetailed(
			{ decisionAgent, rules: "guarded", memory: () => undefined },
			"что-нибудь вкусное к чаю",
			"something tasty for tea",
		);

		expect(verdict).toMatchObject({ intent: "search", source: "laya" });
		expect(decisionAgent.capturedState).toEqual({
			message: "something tasty for tea",
		});
	});

	test("a Laya verdict carries the chosen option's probability as its confidence", async () => {
		const decisionAgent = fakeDecisionAgent({
			type: "choice",
			choice: "search",
			probabilities: { search: 0.62, chat: 0.38 },
		});
		const verdict = await classifyMessageIntentDetailed(
			{ decisionAgent, rules: "guarded" },
			"something tasty for tea",
		);
		expect(verdict).toMatchObject({ intent: "search", confidence: 0.62 });
	});

	test("no probabilities, no confidence (never invented)", async () => {
		const decisionAgent = fakeDecisionAgent({
			type: "choice",
			choice: "search",
		});
		const verdict = await classifyMessageIntentDetailed(
			{ decisionAgent, rules: "guarded" },
			"something tasty for tea",
		);
		expect(verdict.confidence).toBeUndefined();
	});

	test("guarded rules: only the words of checkout/removal are taken from rules, everything else goes to memory and Laya", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("search"));

		// «купи 1 сыр» is a plain rule hit in the default mode; guarded, Laya decides.
		expect(
			await classifyMessageIntentDetailed(
				{ decisionAgent, rules: "guarded" },
				"купи 1 сыр",
			),
		).toMatchObject({ intent: "search", source: "laya" });

		// But «оформи заказ» is still decided by its words, before memory and Laya.
		const verdict = await classifyMessageIntentDetailed(
			{ decisionAgent, rules: "guarded", memory: () => hit("addToCart") },
			"оформи заказ",
		);
		expect(verdict).toMatchObject({ intent: "checkout", source: "words" });
	});

	test("a Laya that fails costs the answer, not the message: the words decide, else chat", async () => {
		const decisionAgent: DecisionAgent = {
			async decide() {
				throw new Error("laya is down");
			},
		};

		expect(
			await classifyMessageIntentDetailed(
				{ decisionAgent, rules: "guarded" },
				"купи 1 сыр",
			),
		).toMatchObject({ intent: "addToCart", source: "fallback" });
		expect(
			await classifyMessageIntentDetailed(
				{ decisionAgent, rules: "guarded" },
				"сколько будет два плюс два?",
			),
		).toMatchObject({ intent: "chat", source: "fallback" });
	});

	test("the default mode still takes every word rule before memory and Laya", async () => {
		const decisionAgent = fakeDecisionAgent(choiceAnswer("search"));

		expect(
			await classifyMessageIntentDetailed(
				{ decisionAgent, memory: () => hit("chat") },
				"купи 1 сыр",
			),
		).toMatchObject({ intent: "addToCart", source: "words" });
	});
});

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
			type: "boolean",
			probability: 0.9,
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

	test("a fact that only has the opposite value in the catalog is not producible: removal degrades instead of an unplannable goal", () => {
		const addOnly: GoapAction = {
			name: "cartTool",
			cost: 3,
			preconditions: {},
			effects: { inCart: true },
			execute: async () => ({}),
		};

		expect(goalForIntent("removeFromCart", baseGoal, [addOnly])).toEqual({
			replied: true,
		});
		expect(
			goalForIntent("removeFromCart", baseGoal, [
				{ ...addOnly, effects: { inCart: false } },
			]),
		).toEqual({ replied: true, inCart: false });
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

describe("the message-intent question", () => {
	test("is one Laya call of at most 10 options, without the intents only words may decide", async () => {
		let calls = 0;
		let options: string[] = [];
		const agent: DecisionAgent = {
			async decide(_state, questions) {
				calls++;
				const q = questions.intent;
				options = q?.type === "choice" ? Object.keys(q.criteria) : [];
				return { intent: choiceAnswer("search") };
			},
		};
		const intent = await classifyMessageIntent(
			{ decisionAgent: agent, cues: false },
			"find cheese",
		);
		expect(intent).toBe("search");
		expect(calls).toBe(1);
		expect(options.length).toBeLessThanOrEqual(10);
		expect(options).not.toContain("checkout");
		expect(options).not.toContain("removeFromCart");
	});
});
