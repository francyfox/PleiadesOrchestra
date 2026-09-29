import { describe, expect, test } from "bun:test";
import type { DecisionAgent, DecisionAnswer } from "../decision-types.ts";
import { createWebMcpActions } from "./webmcp-actions.ts";

function fakeDecisionAgent(choice: string): DecisionAgent & {
	capturedState?: unknown;
	capturedCriteria?: unknown;
} {
	const agent: DecisionAgent & {
		capturedState?: unknown;
		capturedCriteria?: unknown;
	} = {
		async decide(state, questions) {
			agent.capturedState = state;
			const question = questions.intent;
			agent.capturedCriteria =
				question?.type === "choice" ? question.criteria : undefined;
			const answer: DecisionAnswer = {
				type: "choice",
				choice,
				probabilities: { [choice]: 1 },
				confidence: 1,
				rl_agent: { act_probability: 1 },
			};
			return { intent: answer };
		},
	};
	return agent;
}

describe("createWebMcpActions", () => {
	test("classifies each tool once and builds preconditions/effects from its intent", async () => {
		const decisionAgent = fakeDecisionAgent("addToCart");

		const actions = await createWebMcpActions({
			tools: [
				{
					name: "add_to_cart",
					description: "Add an item to the cart",
					inputSchema: { type: "object", properties: { itemId: {} } },
				},
			],
			decisionAgent,
		});

		expect(actions).toHaveLength(1);
		expect(actions[0]).toMatchObject({
			name: "add_to_cart",
			preconditions: { itemSelected: true },
			effects: { inCart: true, "toolResult:add_to_cart": true },
		});
		expect(decisionAgent.capturedState).toEqual({
			name: "add_to_cart",
			description: "Add an item to the cart",
		});
		expect(decisionAgent.capturedCriteria).toContain("addToCart");
		expect(decisionAgent.capturedCriteria).toContain("other");
	});

	test("costFor overrides the default cost, per tool", async () => {
		const decisionAgent = fakeDecisionAgent("search");

		const actions = await createWebMcpActions({
			tools: [{ name: "search_products" }],
			decisionAgent,
			costFor: () => 7,
		});

		expect(actions[0]?.cost).toBe(7);
	});

	test("execute() asks to wait when the browser hasn't reported a result yet, with the tool name and built arguments", async () => {
		const decisionAgent = fakeDecisionAgent("addToCart");
		const actions = await createWebMcpActions({
			tools: [
				{
					name: "add_to_cart",
					inputSchema: {
						type: "object",
						properties: { itemId: {}, quantity: {} },
					},
				},
			],
			decisionAgent,
		});
		const action = actions[0];
		if (!action) throw new Error("expected one action");

		const outcome = await action.execute({
			state: { itemId: "sku-1", quantity: 2, unrelated: "x" },
		});

		expect(outcome).toEqual({
			waiting: {
				kind: "webmcp_tool_call",
				payload: {
					tool: "add_to_cart",
					arguments: { itemId: "sku-1", quantity: 2 },
				},
			},
		});
	});

	test("execute() returns the real effects once the browser's result is in state (ok)", async () => {
		const decisionAgent = fakeDecisionAgent("addToCart");
		const actions = await createWebMcpActions({
			tools: [{ name: "add_to_cart" }],
			decisionAgent,
		});
		const action = actions[0];
		if (!action) throw new Error("expected one action");

		const outcome = await action.execute({
			state: { "webmcp:add_to_cart:result": "ok" },
		});

		expect(outcome).toEqual({
			inCart: true,
			"toolResult:add_to_cart": true,
		});
	});

	test("execute() reports failure without re-waiting when the browser's result is an error", async () => {
		const decisionAgent = fakeDecisionAgent("addToCart");
		const actions = await createWebMcpActions({
			tools: [{ name: "add_to_cart" }],
			decisionAgent,
		});
		const action = actions[0];
		if (!action) throw new Error("expected one action");

		const outcome = await action.execute({
			state: { "webmcp:add_to_cart:result": "error" },
		});

		expect(outcome).toEqual({ "toolResult:add_to_cart": false });
	});

	test('an unclassifiable answer falls back to "other": empty preconditions/effects but still classifies once', async () => {
		const decisionAgent = fakeDecisionAgent("nonsense-outside-taxonomy");

		const actions = await createWebMcpActions({
			tools: [{ name: "mystery_tool" }],
			decisionAgent,
		});

		expect(actions[0]).toMatchObject({
			preconditions: {},
			effects: { "toolResult:mystery_tool": true },
		});
	});
});
