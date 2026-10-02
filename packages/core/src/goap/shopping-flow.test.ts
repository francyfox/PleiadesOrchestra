import { describe, expect, test } from "bun:test";
import type { DecisionAgent, DecisionAnswer } from "../decision-types.ts";
import type { Agent } from "../types.ts";
import { pruneUnproducibleFacts } from "./catalog.ts";
import { runPlan } from "./executor.ts";
import { classifyMessageIntent, goalForIntent } from "./message-intent.ts";
import { createProductRequestAction } from "./product-request.ts";
import type { GoapAction, PlanTraceEvent, WorldState } from "./types.ts";
import {
	createWebMcpActions,
	type WebMcpToolCallPayload,
	type WebMcpToolDescriptor,
} from "./webmcp-actions.ts";

// The Basketful demo's three tools, as `document.modelContext` lists them.
const TOOLS: WebMcpToolDescriptor[] = [
	{
		name: "choose_store",
		description:
			"Open one of the grocery stores. Use this first when no store is open.",
		inputSchema: {
			type: "object",
			properties: {
				store: {
					type: "string",
					enum: ["Greenleaf Market", "Harbor Foods Co-op", "Penny Pantry"],
					description:
						"Greenleaf Market: everyday groceries, fastest. Harbor Foods Co-op: organic, pricier. Penny Pantry: lowest prices.",
				},
			},
			required: ["store"],
		} as WebMcpToolDescriptor["inputSchema"],
	},
	{
		name: "search_products",
		description: "Search the open store's catalog.",
		inputSchema: {
			type: "object",
			properties: { query: { type: "string" }, department: { type: "string" } },
		},
	},
	{
		name: "add_to_cart",
		description: "Add one or more products to the open store's cart.",
		inputSchema: {
			type: "object",
			properties: {
				items: {
					type: "array",
					items: {
						type: "object",
						properties: {
							product: { type: "string" },
							quantity: { type: "integer" },
						},
						required: ["product"],
					},
				},
			},
			required: ["items"],
		} as WebMcpToolDescriptor["inputSchema"],
	},
];

const INTENT_OF_TOOL: Record<string, string> = {
	choose_store: "chooseStore",
	search_products: "search",
	add_to_cart: "addToCart",
};

const choice = (value: string): DecisionAnswer => ({
	type: "choice",
	choice: value,
	probabilities: { [value]: 1 },
	confidence: 1,
	rl_agent: { act_probability: 1 },
});

/** Laya stand-in: classifies tools by name, the message as "addToCart", the store as Penny Pantry. */
function fakeLaya(
	messageIntent = "addToCart",
	store = "Greenleaf Market",
): DecisionAgent {
	return {
		async decide(state, questions) {
			const s = state as { name?: string; message?: string };
			const answers: Record<string, DecisionAnswer> = {};
			for (const key of Object.keys(questions)) {
				if (key === "intent") {
					answers[key] = choice(
						s.name ? (INTENT_OF_TOOL[s.name] ?? "other") : messageIntent,
					);
				} else {
					answers[key] = choice(store);
				}
			}
			return answers;
		},
	};
}

function fakeAgent(replyJson: string): Agent {
	return {
		async *handleMessageStream() {
			yield { type: "delta", text: replyJson };
			yield { type: "done", elapsedMs: 1 };
		},
		async resetThread() {},
	};
}

const SEARCH_TEXT =
	"Showing 3 of 3 results at Greenleaf Market:\n" +
	"- Aged Cheddar Cheese — $5.49 (8 oz) — OUT OF STOCK\n" +
	"- Mozzarella Cheese — $3.99 (8 oz) — in stock\n" +
	"- Swiss Cheese — $4.49 (6 oz) — in stock";

/** The tool the run stopped to ask the browser for. */
function waitingTool(result: { waiting?: { payload: unknown } }) {
	return (result.waiting?.payload as WebMcpToolCallPayload | undefined)?.tool;
}

/** Runs the whole turn, answering every `tool_call` like the widget would. */
async function runTurn(
	laya: DecisionAgent,
	replyJson: string,
	message: string,
	extraState: WorldState = {},
) {
	const toolActions = await createWebMcpActions({
		tools: TOOLS,
		decisionAgent: laya,
	});
	const parse = createProductRequestAction({ agent: fakeAgent(replyJson) });
	const actions: GoapAction[] = pruneUnproducibleFacts([...toolActions, parse]);
	const intent = await classifyMessageIntent({ decisionAgent: laya }, message);
	const goal = goalForIntent(intent, {}, actions);

	let state: WorldState = {
		userMessage: message,
		threadId: "t",
		userId: "u",
		...extraState,
	};
	const steps: string[] = [];
	const calls: WebMcpToolCallPayload[] = [];
	const trace: PlanTraceEvent[] = [];
	for (let turn = 0; turn < 10; turn++) {
		const result = await runPlan({
			state,
			goal,
			actions,
			ctx: {},
			maxActionFailures: 2,
			tracer: (event) => trace.push(event),
			onStep: (step) => {
				// The same action reports "running" again when its tool answers.
				const line = `${step.phase}: ${step.text}`;
				if (steps.at(-1) !== line) steps.push(line);
			},
		});
		state = result.finalState;
		if (!result.waiting)
			return { calls, state, succeeded: result.succeeded, trace, steps };
		const payload = result.waiting.payload as WebMcpToolCallPayload;
		calls.push(payload);
		state = {
			...state,
			[`webmcp:${payload.tool}:result`]: "ok",
			[`webmcp:${payload.tool}:text`]:
				payload.tool === "search_products" ? SEARCH_TEXT : "done",
		};
	}
	throw new Error("did not settle");
}

describe("«купи 1 сыр»: выбрать магазин → найти товар → добавить в корзину", () => {
	test("calls the three tools in that order with arguments taken from the message and the search result", async () => {
		const { calls, succeeded, state } = await runTurn(
			fakeLaya(),
			'{"query":"cheese","quantity":1}',
			"купи 1 сыр",
		);

		expect(calls.map((call) => call.tool)).toEqual([
			"choose_store",
			"search_products",
			"add_to_cart",
		]);
		expect(calls[0]?.arguments).toEqual({ store: "Greenleaf Market" });
		expect(calls[1]?.arguments).toEqual({ query: "cheese" });
		// First product that is in stock, exact name from the search result.
		expect(calls[2]?.arguments).toEqual({
			items: [{ product: "Mozzarella Cheese", quantity: 1 }],
		});
		expect(succeeded).toBe(true);
		expect(state.inCart).toBe(true);
	});

	test("the store comes from Laya's choice among the tool's own enum values", async () => {
		const { calls } = await runTurn(
			fakeLaya("addToCart", "Penny Pantry"),
			'{"query":"cheese","quantity":2}',
			"купи 2 сыра подешевле",
		);
		expect(calls[0]?.arguments).toEqual({ store: "Penny Pantry" });
		expect(calls[2]?.arguments).toEqual({
			items: [{ product: "Mozzarella Cheese", quantity: 2 }],
		});
	});

	test("an already open store is not chosen again", async () => {
		const laya = fakeLaya();
		const toolActions = await createWebMcpActions({
			tools: TOOLS,
			decisionAgent: laya,
		});
		const parse = createProductRequestAction({
			agent: fakeAgent('{"query":"cheese","quantity":1}'),
		});
		const actions = pruneUnproducibleFacts([...toolActions, parse]);
		const result = await runPlan({
			state: {
				userMessage: "купи сыр",
				storeOpen: true,
				store: "Penny Pantry",
			},
			goal: { inCart: true },
			actions,
			ctx: {},
		});
		// First thing it asks the browser for is the search, not choose_store.
		expect(waitingTool(result)).toBe("search_products");
	});

	test("with no store tool on the site, the store step simply disappears from the plan", async () => {
		const laya = fakeLaya();
		const tools = TOOLS.filter((tool) => tool.name !== "choose_store");
		const toolActions = await createWebMcpActions({
			tools,
			decisionAgent: laya,
		});
		const parse = createProductRequestAction({
			agent: fakeAgent('{"query":"cheese","quantity":1}'),
		});
		const actions = pruneUnproducibleFacts([...toolActions, parse]);
		const result = await runPlan({
			state: { userMessage: "купи сыр" },
			goal: { inCart: true },
			actions,
			ctx: {},
		});
		expect(waitingTool(result)).toBe("search_products");
	});

	test("a search with nothing in stock ends the run instead of looping through replans", async () => {
		const laya = fakeLaya();
		const toolActions = await createWebMcpActions({
			tools: TOOLS,
			decisionAgent: laya,
		});
		const parse = createProductRequestAction({
			agent: fakeAgent('{"query":"cheese","quantity":1}'),
		});
		const actions = pruneUnproducibleFacts([...toolActions, parse]);
		let state: WorldState = { userMessage: "купи сыр" };
		let attempts = 0;
		for (let turn = 0; turn < 10; turn++) {
			const result = await runPlan({
				state,
				goal: { inCart: true },
				actions,
				ctx: {},
				maxActionFailures: 2,
				tracer: (event) => {
					if (event.type === "finished") attempts = event.attempts;
				},
			});
			state = result.finalState;
			if (!result.waiting) {
				expect(result.succeeded).toBe(false);
				expect(attempts).toBeLessThan(5);
				return;
			}
			const tool = (result.waiting.payload as WebMcpToolCallPayload).tool;
			state = {
				...state,
				[`webmcp:${tool}:result`]: "ok",
				[`webmcp:${tool}:text`]:
					tool === "search_products"
						? 'No products found at Greenleaf Market for "cheese".'
						: "done",
			};
		}
		throw new Error("did not settle");
	});
});

describe("search answers in a format the parser doesn't know", () => {
	test("the search query stands in for the product, and the site resolves the name", async () => {
		const laya = fakeLaya();
		const toolActions = await createWebMcpActions({
			tools: TOOLS,
			decisionAgent: laya,
		});
		const parse = createProductRequestAction({
			agent: fakeAgent('{"query":"cheese","quantity":1}'),
		});
		const actions = pruneUnproducibleFacts([...toolActions, parse]);
		const search = actions.find((action) => action.name === "search_products");
		const outcome = await search?.execute({
			state: {
				query: "cheese",
				"webmcp:search_products:result": "ok",
				"webmcp:search_products:text": '{"hits":[{"id":7}]}',
			},
		});
		expect(outcome).toMatchObject({ catalogSearched: true, product: "cheese" });
	});
});

describe("the flow, told to the user", () => {
	test("each step is announced in Russian by default, with what was found", async () => {
		const { steps } = await runTurn(
			fakeLaya(),
			'{"query":"cheese","quantity":1}',
			"купи 1 сыр",
		);
		expect(steps).toEqual([
			"running: Разбираю запрос…",
			"done: Понял: 1 × «cheese»",
			"running: Выбираю магазин…",
			"done: Выбран магазин: Greenleaf Market",
			"running: Открываю магазин Greenleaf Market…",
			"done: Магазин открыт: Greenleaf Market",
			"running: Ищу «cheese»…",
			"done: Нашёл: Mozzarella Cheese",
			"running: Добавляю в корзину: 1 × Mozzarella Cheese…",
			"done: Добавлено в корзину: 1 × Mozzarella Cheese",
		]);
	});

	test("an English page gets English text", async () => {
		const { steps } = await runTurn(
			fakeLaya(),
			'{"query":"cheese","quantity":2}',
			"buy 2 cheese",
			{ "page:lang": "en" },
		);
		expect(steps).toContain("done: Understood: 2 × “cheese”");
		expect(steps).toContain("running: Opening store Greenleaf Market…");
		expect(steps.at(-1)).toBe("done: Added to cart: 2 × Mozzarella Cheese");
	});

	test("a search with no hits is reported as failed, saying what was looked for", async () => {
		const laya = fakeLaya();
		const toolActions = await createWebMcpActions({
			tools: TOOLS,
			decisionAgent: laya,
		});
		const parse = createProductRequestAction({
			agent: fakeAgent('{"query":"cheese","quantity":1}'),
		});
		const actions = pruneUnproducibleFacts([...toolActions, parse]);
		const steps: string[] = [];
		let state: WorldState = {
			userMessage: "купи сыр",
			storeOpen: true,
			store: "X",
		};
		for (let turn = 0; turn < 6; turn++) {
			const result = await runPlan({
				state,
				goal: { inCart: true },
				actions,
				ctx: {},
				maxActionFailures: 2,
				onStep: (step) => steps.push(`${step.phase}: ${step.text}`),
			});
			state = result.finalState;
			if (!result.waiting) break;
			state = {
				...state,
				"webmcp:search_products:result": "ok",
				"webmcp:search_products:text": 'No products found for "cheese".',
			};
		}
		expect(steps).toContain("failed: Ничего не нашёл по запросу «cheese»");
	});

	test("a navigation to the page the visitor is already on says so", async () => {
		const laya = fakeLaya();
		const [action] = await createWebMcpActions({
			tools: [
				{
					name: "go_to",
					inputSchema: { type: "object", properties: { path: {} } },
				},
			],
			decisionAgent: {
				decide: async () => ({ intent: choice("navigate") }),
			},
		});
		void laya;
		const state: WorldState = {
			path: "/cart",
			"page:path": "/ru/cart?utm_source=x",
		};
		const out = (await action?.execute({ state })) as WorldState;
		expect(action?.describe?.({ ...state, ...out }, "done")).toBe(
			"Вы уже на этой странице",
		);
	});
});
