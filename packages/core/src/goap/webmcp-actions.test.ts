import { describe, expect, test } from "bun:test";
import type { DecisionAgent, DecisionAnswer } from "../decision-types.ts";
import type {
	FunctionCallAgent,
	FunctionCallRequest,
} from "../function-call-agent.ts";
import {
	createWebMcpActions,
	firstListedProductName,
} from "./webmcp-actions.ts";

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

		// A name that says nothing: Laya sorts it (a name like `add_to_cart` is
		// read without asking, see `tool-cues.ts`).
		const actions = await createWebMcpActions({
			tools: [
				{
					name: "cart_helper",
					description: "Add an item to the cart",
					inputSchema: { type: "object", properties: { itemId: {} } },
				},
			],
			decisionAgent,
		});

		expect(actions).toHaveLength(1);
		expect(actions[0]).toMatchObject({
			name: "cart_helper",
			// Needs a store, a search and the parsed request first.
			preconditions: {
				storeOpen: true,
				catalogSearched: true,
				requestParsed: true,
			},
			effects: { inCart: true, "toolResult:cart_helper": true },
		});
		expect(decisionAgent.capturedState).toEqual({
			name: "cart_helper",
			description: "Add an item to the cart",
		});
		expect(Object.keys(decisionAgent.capturedCriteria as object)).toContain(
			"addToCart",
		);
		expect(Object.keys(decisionAgent.capturedCriteria as object)).toContain(
			"other",
		);
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

describe("firstListedProductName", () => {
	test("takes the first in-stock list item, cut before the price", () => {
		expect(
			firstListedProductName(
				"Showing 2:\n- Aged Cheddar — $5 (8 oz) — OUT OF STOCK\n- Swiss Cheese — $4.49 (6 oz) — in stock",
			),
		).toBe("Swiss Cheese");
	});

	test("understands numbered lists and plain names", () => {
		expect(firstListedProductName("1. Oat Milk\n2. Whole Milk")).toBe(
			"Oat Milk",
		);
	});

	test("nothing listed, or nothing in stock, gives undefined", () => {
		expect(firstListedProductName("No products found.")).toBeUndefined();
		expect(firstListedProductName("- Brie — OUT OF STOCK")).toBeUndefined();
	});
});

describe("navigation tools and the page the visitor is on", () => {
	const gotoTool = {
		name: "go_to",
		description: "Open a page of the site",
		inputSchema: { type: "object" as const, properties: { path: {} } },
	};

	async function navigateAction() {
		const [action] = await createWebMcpActions({
			tools: [gotoTool],
			decisionAgent: fakeDecisionAgent("navigate"),
		});
		if (!action) throw new Error("expected one action");
		return action;
	}

	test("a navigate tool is classified with its own effect", async () => {
		const action = await navigateAction();
		expect(action.effects).toMatchObject({ pageOpened: true });
		expect(action.preconditions).toEqual({});
	});

	test("it asks the browser when the destination is another page", async () => {
		const outcome = await (await navigateAction()).execute({
			state: { path: "/cart", "page:path": "/ru/store/greenleaf?q=milk" },
		});
		expect(outcome).toMatchObject({ waiting: { payload: { tool: "go_to" } } });
	});

	test("it does nothing when the visitor is already there, whatever the language or tracking parameters", async () => {
		const outcome = await (await navigateAction()).execute({
			state: { path: "/cart", "page:path": "/ru/cart?utm_source=mail&lang=ru" },
		});
		expect(outcome).toEqual({
			pageOpened: true,
			"toolResult:go_to": true,
			pageAlreadyOpen: true,
		});
	});

	test("without a known current page it still navigates", async () => {
		const outcome = await (await navigateAction()).execute({
			state: { path: "/cart" },
		});
		expect(outcome).toMatchObject({ waiting: expect.anything() });
	});
});

describe("tool arguments written by the function-call model", () => {
	const SEARCH_TOOL = {
		name: "search_products",
		description: "Search the catalog",
		inputSchema: {
			type: "object" as const,
			properties: { query: { type: "string" } },
			required: ["query"],
		},
	};

	function fakeFunctionCall(
		answer: Record<string, unknown> | Error,
	): FunctionCallAgent & { requests: FunctionCallRequest[] } {
		const requests: FunctionCallRequest[] = [];
		return {
			requests,
			async fillArguments(request) {
				requests.push(request);
				if (answer instanceof Error) throw answer;
				return answer;
			},
		};
	}

	async function searchAction(
		functionCallAgent?: FunctionCallAgent,
		moreTools: { name: string }[] = [],
	) {
		const actions = await createWebMcpActions({
			tools: [SEARCH_TOOL, ...moreTools],
			decisionAgent: fakeDecisionAgent("search"),
			functionCallAgent,
		});
		const action = actions.find((a) => a.name === "search_products");
		if (!action) throw new Error("expected the search action");
		return action;
	}

	test("the model's JSON becomes the browser call's arguments, and it sees the facts, the user's words and the last tool answer", async () => {
		const agent = fakeFunctionCall({ query: "cheese" });
		const action = await searchAction(agent, [{ name: "browse_aisle" }]);

		const outcome = await action.execute({
			state: {
				userMessage: "купи 1 сыр",
				threadId: "t",
				userId: "u",
				planRunId: "p",
				query: "cheese",
				quantity: 1,
				store: "Penny Pantry",
				"webmcp:browse_aisle:text": "Opened Penny Pantry",
				"webmcp:browse_aisle:result": "ok",
				"toolResult:browse_aisle": true,
				"param:choose_store:store": true,
				"page:path": "/store",
			},
		});

		expect(outcome).toEqual({
			waiting: {
				kind: "webmcp_tool_call",
				payload: { tool: "search_products", arguments: { query: "cheese" } },
			},
		});
		const [request] = agent.requests;
		expect(request?.request).toBe("купи 1 сыр");
		expect(request?.facts).toEqual({
			query: "cheese",
			quantity: 1,
			store: "Penny Pantry",
		});
		expect(request?.lastAnswer).toBe("Opened Penny Pantry");
		expect(request?.context).toEqual({
			threadId: "t",
			userId: "u",
			planRunId: "p",
			actionName: "search_products",
		});
	});

	test("a found product is remembered for the next message, a failed search forgets it", async () => {
		const action = await searchAction(fakeFunctionCall({}));
		const found = await action.execute({
			state: {
				query: "milk",
				"webmcp:search_products:result": "ok",
				"webmcp:search_products:text":
					"Showing 2 results:\n- Whole Milk — $3.69 (1 gal) — in stock\n- Oat Milk — $4.29 — in stock",
			},
		});
		expect(found).toMatchObject({
			product: "Whole Milk",
			lastProduct: "Whole Milk",
		});

		const missed = await action.execute({
			state: {
				query: "croissants",
				lastProduct: "Whole Milk",
				"webmcp:search_products:result": "ok",
				"webmcp:search_products:text": 'No products found for "croissants".',
			},
		});
		expect(missed).toEqual({
			"toolResult:search_products": false,
			lastProduct: "",
		});
	});

	test("the remembered product is not shown to the function-call model as a fact", async () => {
		const agent = fakeFunctionCall({ query: "cheese" });
		const action = await searchAction(agent);
		await action.execute({
			state: { query: "cheese", lastProduct: "Whole Milk" },
		});
		expect(agent.requests[0]?.facts).toEqual({ query: "cheese" });
	});

	test("facts named like a parameter always make it into the call, even when the model leaves them out", async () => {
		const agent = fakeFunctionCall({});
		const action = await searchAction(agent);
		const outcome = await action.execute({ state: { query: "cheese" } });
		expect(outcome).toMatchObject({
			waiting: { payload: { arguments: { query: "cheese" } } },
		});
	});

	test("the model fills what the facts don't say, and the facts win where both speak", async () => {
		const agent = fakeFunctionCall({ query: "wrong", extra: "x" });
		const action = await searchAction(agent);
		const outcome = await action.execute({ state: { query: "cheese" } });
		expect(outcome).toMatchObject({
			waiting: {
				payload: { arguments: { query: "cheese", extra: "x" } },
			},
		});
	});

	test("the model sees no flags and only the answer of a search, never of another step", async () => {
		const agent = fakeFunctionCall({ query: "cheese" });
		const actions = await createWebMcpActions({
			tools: [
				{ name: "choose_store", inputSchema: { type: "object" } },
				SEARCH_TOOL,
			],
			decisionAgent: {
				async decide(state) {
					const name = (state as { name: string }).name;
					const choice = name === "choose_store" ? "chooseStore" : "search";
					return {
						intent: {
							type: "choice",
							choice,
							probabilities: { [choice]: 1 },
							confidence: 1,
							rl_agent: { act_probability: 1 },
						},
					};
				},
			},
			functionCallAgent: agent,
		});
		const search = actions.find((a) => a.name === "search_products");
		await search?.execute({
			state: {
				query: "cheese",
				messageIntent: "checkout",
				requestParsed: true,
				storeOpen: true,
				"webmcp:choose_store:text": "Departments: Produce, Dairy",
			},
		});
		const [request] = agent.requests;
		expect(request?.facts).toEqual({ query: "cheese" });
		expect(request?.lastAnswer).toBeUndefined();
	});

	test("the model is shown the English translation of the request when there is one", async () => {
		const agent = fakeFunctionCall({ query: "cheese" });
		const action = await searchAction(agent);

		await action.execute({
			state: {
				userMessage: "купи 1 сыр",
				userMessageEn: "buy one cheese",
				query: "cheese",
			},
		});

		expect(agent.requests[0]?.request).toBe("buy one cheese");
	});

	test("a failed or unusable model answer falls back to arguments built from the facts", async () => {
		const action = await searchAction(fakeFunctionCall(new Error("503")));
		const outcome = await action.execute({ state: { query: "cheese" } });
		expect(outcome).toMatchObject({
			waiting: { payload: { arguments: { query: "cheese" } } },
		});
	});

	test("a tool without parameters is called with none, the model is not asked", async () => {
		const agent = fakeFunctionCall({ x: 1 });
		const actions = await createWebMcpActions({
			tools: [{ name: "view_cart", inputSchema: { type: "object" } }],
			decisionAgent: fakeDecisionAgent("viewCart"),
			functionCallAgent: agent,
		});
		const outcome = await actions[0]?.execute({ state: {} });
		expect(outcome).toMatchObject({
			waiting: { payload: { tool: "view_cart", arguments: {} } },
		});
		expect(agent.requests).toHaveLength(0);
	});

	test("a model failure is reported through onError, the fallback still runs", async () => {
		const errors: unknown[] = [];
		const actions = await createWebMcpActions({
			tools: [SEARCH_TOOL],
			decisionAgent: fakeDecisionAgent("search"),
			functionCallAgent: fakeFunctionCall(new Error("delta down")),
			onError: (error, context) => errors.push([String(error), context]),
		});
		await actions[0]?.execute({ state: { query: "cheese" } });
		expect(errors).toEqual([
			["Error: delta down", { tool: "search_products" }],
		]);
	});

	test("arguments still missing a required field are not sent to the browser: the step fails and says why", async () => {
		const errors: unknown[] = [];
		const actions = await createWebMcpActions({
			tools: [SEARCH_TOOL],
			decisionAgent: fakeDecisionAgent("search"),
			functionCallAgent: fakeFunctionCall(new Error("503")),
			onError: (error) => errors.push(String(error)),
		});
		const outcome = await actions[0]?.execute({ state: {} });
		expect(outcome).toEqual({ "toolResult:search_products": false });
		expect(errors).toContain(
			"Error: search_products: query is required (arguments for the call are incomplete)",
		);
	});
});

describe("tool classification by name", () => {
	test("a tool whose name says what it does is sorted without asking Laya", async () => {
		const decisionAgent = fakeDecisionAgent("removeFromCart");

		const actions = await createWebMcpActions({
			tools: [
				{ name: "add_to_cart", description: "Add products to the cart" },
				{ name: "get_cart", description: "Read the cart, add what is missing" },
			],
			decisionAgent,
		});

		expect(decisionAgent.capturedState).toBeUndefined();
		expect(
			actions.find((a) => a.name === "add_to_cart")?.effects,
		).toMatchObject({
			inCart: true,
		});
		// A read has no shop effect, whatever its description mentions.
		expect(actions.find((a) => a.name === "get_cart")?.effects).toEqual({
			"toolResult:get_cart": true,
		});
	});

	test("Laya alone never makes a tool a checkout or a removal", async () => {
		for (const risky of ["checkout", "removeFromCart"]) {
			const actions = await createWebMcpActions({
				tools: [{ name: "do_thing", description: "Does a thing" }],
				decisionAgent: fakeDecisionAgent(risky),
			});
			expect(actions[0]?.effects).toEqual({ "toolResult:do_thing": true });
		}
	});

	test("the plain tool of an intent wins the tie against its specialists on cost", async () => {
		const actions = await createWebMcpActions({
			tools: [
				{ name: "add_recipe_to_cart" },
				{ name: "add_to_cart" },
				{ name: "add_staples_to_cart" },
			],
			decisionAgent: fakeDecisionAgent("other"),
		});
		const cost = (name: string) => actions.find((a) => a.name === name)?.cost;
		expect(cost("add_to_cart")).toBeLessThan(cost("add_recipe_to_cart") ?? 0);
		expect(cost("add_to_cart")).toBeLessThan(cost("add_staples_to_cart") ?? 0);
	});
});
