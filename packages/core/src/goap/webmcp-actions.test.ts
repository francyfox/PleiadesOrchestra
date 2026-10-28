import { describe, expect, test } from "bun:test";
import type {
	DecisionAgent,
	DecisionAnswer,
	DecisionQuestion,
} from "#core/decision-types";
import type {
	FunctionCallAgent,
	FunctionCallRequest,
} from "#core/function-call-agent";
import {
	createWebMcpActions,
	firstListedProductName,
	type WebMcpToolDescriptor,
} from "#core/goap/webmcp-actions";
import type { LlmCallRecord } from "#core/types";
import { UntranslatableError } from "#core/untranslatable-error";
import { withChoiceReport } from "#core/usage-collector";

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

	test("an add tool that picked the items itself (a bundle): what it says it added becomes the found items", async () => {
		const actions = await createWebMcpActions({
			tools: [{ name: "add_bundle_to_cart" }],
			decisionAgent: fakeDecisionAgent("addToCart"),
		});
		const action = actions.find((a) => a.name === "add_bundle_to_cart");
		if (!action) throw new Error("expected the bundle action");

		const outcome = await action.execute({
			state: {
				"webmcp:add_bundle_to_cart:result": "ok",
				"webmcp:add_bundle_to_cart:text":
					"Desk setup: Added: 1 × USB-C Hub (new); 2 × HDMI Cable (2 m)",
			},
		});

		expect(outcome).toMatchObject({
			inCart: true,
			product: "USB-C Hub",
			quantity: 1,
			foundItems: JSON.stringify([
				{ name: "USB-C Hub", quantity: 1 },
				{ name: "HDMI Cable", quantity: 2 },
			]),
		});
	});

	test("a product already known from the search is not replaced by the answer's wording", async () => {
		const actions = await createWebMcpActions({
			tools: [{ name: "add_to_cart" }],
			decisionAgent: fakeDecisionAgent("addToCart"),
		});
		const action = actions[0];
		if (!action) throw new Error("expected one action");

		const outcome = await action.execute({
			state: {
				product: "Oat Milk",
				"webmcp:add_to_cart:result": "ok",
				"webmcp:add_to_cart:text":
					"Added to the cart:\n- 1 × Oat Milk (now 1 in cart)",
			},
		});

		expect(outcome).toEqual({ inCart: true, "toolResult:add_to_cart": true });
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
				userMessage: "buy 1 cheese",
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
		expect(request?.request).toBe("buy 1 cheese");
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

	test("a message in another language without a translation: the model is not asked, the arguments come from the facts", async () => {
		const agent = fakeFunctionCall({ query: "сыр" });
		const action = await searchAction(agent);

		const outcome = await action.execute({
			state: { userMessage: "купи 1 сыр", query: "cheese" },
		});

		expect(agent.requests).toHaveLength(0);
		expect(outcome).toMatchObject({
			waiting: { payload: { arguments: { query: "cheese" } } },
		});
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

	test("the visitor's local date is among the facts the model reads", async () => {
		const agent = fakeFunctionCall({ query: "x" });
		const actions = await createWebMcpActions({
			tools: [SEARCH_TOOL],
			decisionAgent: fakeDecisionAgent("search"),
			functionCallAgent: agent,
		});
		await actions[0]?.execute({
			state: {
				userMessageEn: "x",
				today: "2026-10-27",
				timeZone: "Asia/Almaty",
			},
		});
		expect(agent.requests[0]?.facts).toMatchObject({
			today: "2026-10-27",
			timeZone: "Asia/Almaty",
		});
	});

	test("a required parameter nothing could fill: no browser call, the missing ones are a fact", async () => {
		const tool = {
			name: "bookSlot",
			description: "Book a slot",
			inputSchema: {
				type: "object" as const,
				properties: {
					date: { type: "string", description: "day of the visit, YYYY-MM-DD" },
					name: { type: "string" },
				},
				required: ["date", "name"],
			},
		};
		const actions = await createWebMcpActions({
			tools: [tool],
			decisionAgent: fakeDecisionAgent("addToCart"),
			functionCallAgent: fakeFunctionCall({ name: "Danil" }),
		});
		const outcome = await actions
			.at(-1)
			?.execute({ state: { userMessageEn: "book" } });
		expect(outcome).toEqual({
			"toolResult:bookSlot": false,
			missingParams: JSON.stringify({
				tool: "bookSlot",
				params: [{ name: "date", description: "day of the visit, YYYY-MM-DD" }],
			}),
		});
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
		expect(outcome).toMatchObject({ "toolResult:search_products": false });
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
		// A read has no shop effect, whatever its description mentions: it only
		// makes the list known.
		expect(actions.find((a) => a.name === "get_cart")?.effects).toEqual({
			listRead: true,
			"toolResult:get_cart": true,
		});
	});

	test("an edit tool whose schema says 0 removes is a removal; the same edit without it is not", async () => {
		const withQuantity = (description: string) => ({
			type: "object" as const,
			properties: {
				product: { type: "string" },
				quantity: { type: "integer", minimum: 0, description },
			},
			required: ["product", "quantity"],
		});
		const actions = await createWebMcpActions({
			tools: [
				{
					name: "update_cart_item",
					inputSchema: withQuantity("The new quantity. 0 removes it."),
				},
				{
					name: "update_stock",
					inputSchema: withQuantity("The new quantity on the shelf."),
				},
			],
			decisionAgent: fakeDecisionAgent("other"),
		});

		expect(
			actions.find((a) => a.name === "update_cart_item")?.effects,
		).toMatchObject({ inCart: false });
		expect(actions.find((a) => a.name === "update_stock")?.effects).toEqual({
			"toolResult:update_stock": true,
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

describe("choosing an enum parameter: English for Laya, a safe value without it", () => {
	const setStore: WebMcpToolDescriptor = {
		name: "set_store",
		description: "Choose a store",
		inputSchema: {
			type: "object",
			required: ["store"],
			properties: {
				store: { type: "string", enum: ["Алматы", "Астана"] },
			},
		},
	};

	async function chooseAction(decisionAgent: DecisionAgent) {
		const actions = await createWebMcpActions({
			tools: [setStore],
			decisionAgent,
		});
		const action = actions.find((a) => a.name === "choose:set_store.store");
		if (!action) throw new Error("no choice step");
		return action;
	}

	test("asks about the English message when there is one", async () => {
		const seen: unknown[] = [];
		const action = await chooseAction({
			async decide(state, questions) {
				if ("intent" in questions) {
					return { intent: { type: "choice", choice: "other" } };
				}
				seen.push(state);
				const none: Record<string, DecisionAnswer> = {};
				return none;
			},
		});
		await action.execute({
			state: {
				userMessage: "купи сыр в Астане",
				userMessageEn: "buy cheese in Astana",
			},
		});
		expect(seen).toEqual([{ message: "buy cheese in Astana" }]);
	});

	test("when Laya cannot be asked (nothing to translate with), the first option is taken", async () => {
		const action = await chooseAction({
			async decide(_state, questions) {
				if ("intent" in questions) {
					return { intent: { type: "choice", choice: "other" } };
				}
				throw new UntranslatableError("купи сыр");
			},
		});
		expect(
			await action.execute({ state: { userMessage: "купи сыр" } }),
		).toEqual({
			store: "Алматы",
			"param:set_store:store": true,
		});
	});
});

describe("choosing an optional enum parameter", () => {
	const setSize: WebMcpToolDescriptor = {
		name: "set_pizza_size",
		description: "Change the size",
		inputSchema: {
			type: "object",
			properties: {
				size: { type: "string", enum: ["Small", "Medium", "Large"] },
				number_of_persons: { type: "number" },
			},
		},
	};

	function agentPicking(
		choice: string,
		probability = 0.9,
		seen: Record<string, DecisionQuestion> = {},
	): DecisionAgent {
		return {
			async decide(_state, questions) {
				Object.assign(seen, questions);
				const answer: DecisionAnswer = {
					type: "choice",
					choice,
					probabilities: { [choice]: probability },
				};
				return { [Object.keys(questions)[0] as string]: answer };
			},
		};
	}

	async function build(decisionAgent: DecisionAgent) {
		const actions = await createWebMcpActions({
			tools: [setSize],
			decisionAgent,
		});
		const choose = actions.find((a) => a.name === "choose:set_pizza_size.size");
		const tool = actions.find((a) => a.name === "set_pizza_size");
		if (!choose || !tool) throw new Error("missing actions");
		return { choose, tool };
	}

	test("gets a choice step that the tool waits for, with the schema order and a 'not said' option", async () => {
		const seen: Record<string, DecisionQuestion> = {};
		const { choose, tool } = await build(agentPicking("Large", 0.9, seen));
		expect(tool.preconditions["param:set_pizza_size:size"]).toBe(true);
		expect(choose.effects["param:set_pizza_size:size"]).toBe(true);
		await choose.execute({ state: { userMessage: "the biggest one" } });
		const question = seen["set_pizza_size.size"];
		if (question?.type !== "choice") throw new Error("not a choice");
		expect(Object.keys(question.criteria)).toEqual([
			"Small",
			"Medium",
			"Large",
			"not_said",
		]);
		expect(question.instructions).toContain("Small, Medium, Large");
	});

	test("optional enum: no stated attribute -> no model call, flag set; a matching one -> asked with what was said; no list -> asked", async () => {
		const seen: Record<string, DecisionQuestion> = {};
		const { choose } = await build(agentPicking("Large", 0.9, seen));
		const flagOnly = { "param:set_pizza_size:size": true };
		const state = (attrs?: unknown) => ({
			userMessage: "x",
			...(attrs ? { statedAttributes: JSON.stringify(attrs) } : {}),
		});
		expect(
			await choose.execute({
				state: state([{ name: "diet", value: "vegetarian" }]),
			}),
		).toEqual(flagOnly);
		expect(await choose.execute({ state: state([]) })).toEqual(flagOnly);
		expect(Object.keys(seen)).toHaveLength(0);
		expect(
			await choose.execute({
				state: state([{ name: "size", value: "maximum" }]),
			}),
		).toEqual({ size: "Large", ...flagOnly });
		const question = seen["set_pizza_size.size"];
		if (question?.type !== "choice") throw new Error("not a choice");
		expect(question.instructions).toContain(
			"The visitor said: size = maximum.",
		);
		for (const key of Object.keys(seen)) delete seen[key];
		await choose.execute({ state: state() });
		expect(Object.keys(seen)).toHaveLength(1);
	});

	test("required enum is asked even when nothing matches", async () => {
		const seen: Record<string, DecisionQuestion> = {};
		const actions = await createWebMcpActions({
			tools: [
				{
					name: "book_hotel",
					description: "Book a room",
					inputSchema: {
						type: "object",
						properties: {
							room: { type: "string", enum: ["single", "double"] },
						},
						required: ["room"],
					},
				},
			],
			decisionAgent: agentPicking("double", 0.9, seen),
		});
		const choose = actions.find((a) => a.name === "choose:book_hotel.room");
		await choose?.execute({
			state: {
				statedAttributes: JSON.stringify([{ name: "city", value: "Rome" }]),
			},
		});
		expect(Object.keys(seen)).toContain("book_hotel.room");
	});

	test("the chosen value lands in the state, so in the tool's arguments", async () => {
		const { choose } = await build(agentPicking("Large"));
		expect(await choose.execute({ state: { userMessage: "max" } })).toEqual({
			size: "Large",
			"param:set_pizza_size:size": true,
		});
	});

	test("'not said', a low probability or a failing call leave the parameter unset", async () => {
		for (const agent of [
			agentPicking("not_said"),
			agentPicking("Large", 0.2),
			{
				async decide() {
					throw new UntranslatableError("x");
				},
			} satisfies DecisionAgent,
		]) {
			const { choose } = await build(agent);
			expect(await choose.execute({ state: { userMessage: "hm" } })).toEqual({
				"param:set_pizza_size:size": true,
			});
		}
	});

	test("the choice is recorded with all its probabilities", async () => {
		const calls: LlmCallRecord[] = [];
		const actions = await createWebMcpActions({
			tools: [setSize],
			decisionAgent: withChoiceReport(agentPicking("Large", 0.8)),
			usageRecorder: { record: (call) => calls.push(call) },
		});
		await actions
			.find((a) => a.name === "choose:set_pizza_size.size")
			?.execute({ state: { threadId: "t", userId: "u", userMessage: "max" } });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			actionName: "choose:set_pizza_size.size",
			kind: "decision",
			threadId: "t",
			choices: [
				{
					question: "set_pizza_size.size",
					chosen: "Large",
					options: { Large: 0.8 },
				},
			],
		});
	});

	test("a value already in the state is kept", async () => {
		const { choose } = await build(agentPicking("Large"));
		expect(
			await choose.execute({ state: { size: "Small", userMessage: "x" } }),
		).toEqual({ "param:set_pizza_size:size": true });
	});
});
