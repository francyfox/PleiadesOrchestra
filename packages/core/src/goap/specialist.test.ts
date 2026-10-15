import { describe, expect, test } from "bun:test";
import type { DecisionAgent } from "../decision-types.ts";
import { plan } from "./plan.ts";
import {
	matchEnumValue,
	matchSpecialist,
	preferSpecialist,
} from "./specialist.ts";
import type { GoapAction, WorldState } from "./types.ts";
import {
	createWebMcpActions,
	type WebMcpToolDescriptor,
} from "./webmcp-actions.ts";

describe("matchEnumValue", () => {
	const recipes = [
		"Simple Tomato Pasta",
		"Weeknight Beef Tacos",
		"Guacamole & Chips",
	];

	test("finds a value inside a sentence, ignoring case and punctuation", () => {
		expect(
			matchEnumValue(
				"Buy ingredients for weeknight  beef-tacos, please",
				recipes,
			),
		).toBe("Weeknight Beef Tacos");
		expect(matchEnumValue("add guacamole and chips", recipes)).toBeUndefined();
		expect(matchEnumValue("guacamole & chips for friday", recipes)).toBe(
			"Guacamole & Chips",
		);
	});

	test("matches whole words only", () => {
		expect(matchEnumValue("simple tomato pastas", recipes)).toBeUndefined();
		expect(matchEnumValue("resimple tomato pasta", recipes)).toBeUndefined();
	});

	test("short values never match: 2D, hot, IMAX stay out", () => {
		expect(
			matchEnumValue("two tickets, 2D, hot seats", ["2D", "hot", "3D"]),
		).toBeUndefined();
	});

	test("the longest of several matching values wins", () => {
		expect(
			matchEnumValue("book the Dolby Atmos Premium show", [
				"Dolby Atmos",
				"Dolby Atmos Premium",
			]),
		).toBe("Dolby Atmos Premium");
	});

	test("works for non-Latin values", () => {
		expect(
			matchEnumValue("закажи Паста с томатами на ужин", ["Паста с томатами"]),
		).toBe("Паста с томатами");
	});
});

const decide: DecisionAgent = {
	async decide(state) {
		const name = (state as { name?: string }).name ?? "";
		const intent: Record<string, string> = {
			choose_store: "chooseStore",
			search_products: "search",
			add_to_cart: "addToCart",
			book_tickets: "addToCart",
			add_bundle_to_cart: "addToCart",
		};
		const choice = intent[name] ?? "other";
		return {
			intent: { type: "choice", choice, probabilities: { [choice]: 1 } },
		};
	},
};

const SEARCH: WebMcpToolDescriptor = {
	name: "search_products",
	inputSchema: { type: "object", properties: { query: { type: "string" } } },
};
const ADD: WebMcpToolDescriptor = {
	name: "add_to_cart",
	inputSchema: {
		type: "object",
		properties: { items: { type: "array" } },
		required: ["items"],
	},
};
const STORE: WebMcpToolDescriptor = {
	name: "choose_store",
	inputSchema: {
		type: "object",
		properties: {
			store: { type: "string", enum: ["Northside Mall", "Harbor Plaza"] },
		},
		required: ["store"],
	},
};
// Cinema: a ticket tool with an enum `format`; not required.
const BOOK: WebMcpToolDescriptor = {
	name: "book_tickets",
	inputSchema: {
		type: "object",
		properties: {
			format: {
				type: "string",
				enum: ["2D", "IMAX Laser", "Dolby Atmos Lounge"],
			},
			count: { type: "integer" },
		},
	},
};
// Electronics: a bundle tool with a required enum.
const BUNDLE: WebMcpToolDescriptor = {
	name: "add_bundle_to_cart",
	inputSchema: {
		type: "object",
		properties: {
			bundle: {
				type: "string",
				enum: [
					"Home Office Starter Kit",
					"Streaming Setup Pro",
					"Gaming Desk Combo",
				],
			},
		},
		required: ["bundle"],
	},
};

async function catalog(
	...tools: WebMcpToolDescriptor[]
): Promise<GoapAction[]> {
	return createWebMcpActions({ tools, decisionAgent: decide });
}

const request = (text: string, extra: WorldState = {}): WorldState => ({
	userMessage: text,
	messageIntent: "addToCart",
	storeOpen: true,
	...extra,
});

describe("matchSpecialist", () => {
	test("a message that names an enum value binds that tool and the parameter", async () => {
		const actions = await catalog(SEARCH, ADD, BUNDLE);
		const facts = matchSpecialist(
			actions,
			request("Please add the Streaming Setup Pro for me"),
		);
		expect(facts).toMatchObject({
			specialistTool: "add_bundle_to_cart",
			bundle: "Streaming Setup Pro",
			"param:add_bundle_to_cart:bundle": true,
			// Nothing to search for or parse: the plan skips both.
			catalogSearched: true,
			requestParsed: true,
		});
	});

	test("an optional enum parameter binds too, and sets no choice flag", async () => {
		const actions = await catalog(SEARCH, ADD, BOOK);
		const facts = matchSpecialist(
			actions,
			request("book 2 tickets in IMAX Laser tonight"),
		);
		expect(facts).toMatchObject({
			specialistTool: "book_tickets",
			format: "IMAX Laser",
		});
		expect(facts).not.toHaveProperty("param:book_tickets:format");
	});

	test("the English translation is read too", async () => {
		const actions = await catalog(ADD, BUNDLE);
		const facts = matchSpecialist(
			actions,
			request("купи набор Gaming Desk Combo", {
				userMessageEn: "Buy the Gaming Desk Combo set",
			}),
		);
		expect(facts?.bundle).toBe("Gaming Desk Combo");
	});

	test("no value in the message: no match", async () => {
		const actions = await catalog(SEARCH, ADD, BOOK, BUNDLE);
		expect(matchSpecialist(actions, request("buy 1 cheese"))).toBeUndefined();
		expect(
			matchSpecialist(actions, request("two tickets in 2D")),
		).toBeUndefined();
	});

	test("only when the message intent is the tool's intent", async () => {
		const actions = await catalog(ADD, BUNDLE);
		expect(
			matchSpecialist(
				actions,
				request("what is in Streaming Setup Pro?", { messageIntent: "search" }),
			),
		).toBeUndefined();
	});

	test("the tool with the longest matched value wins", async () => {
		const actions = await catalog(BOOK, BUNDLE);
		const facts = matchSpecialist(
			actions,
			request("a Home Office Starter Kit, and tickets in Dolby Atmos Lounge"),
		);
		expect(facts?.specialistTool).toBe("add_bundle_to_cart");
	});

	test("a store-picking tool binds its store from the message", async () => {
		const actions = await catalog(STORE);
		expect(
			matchSpecialist(
				actions,
				request("go to Harbor Plaza", { messageIntent: "chooseStore" }),
			),
		).toMatchObject({ specialistTool: "choose_store", store: "Harbor Plaza" });
	});
});

describe("planning with a matched specialist", () => {
	const goal = { inCart: true };

	test("without a match the plain tool wins and searches first (as before)", async () => {
		const actions = await catalog(STORE, SEARCH, ADD, BUNDLE);
		const state = request("buy 1 cheese", { requestParsed: true });
		const steps = plan(state, goal, preferSpecialist(actions, state));
		expect(steps?.map((s) => s.name)).toEqual([
			"search_products",
			"add_to_cart",
		]);
	});

	test("with a match the specialist alone does the job: no search, no parse", async () => {
		const actions = await catalog(STORE, SEARCH, ADD, BUNDLE);
		const base = request("add Home Office Starter Kit");
		const state = { ...base, ...matchSpecialist(actions, base) };
		const steps = plan(state, goal, preferSpecialist(actions, state));
		expect(steps?.map((s) => s.name)).toEqual(["add_bundle_to_cart"]);
	});

	test("the choice step is skipped: the value is already a fact", async () => {
		const actions = await catalog(ADD, BUNDLE);
		const base = request("add Home Office Starter Kit");
		const state = { ...base, ...matchSpecialist(actions, base) };
		const steps = plan(state, goal, preferSpecialist(actions, state));
		expect(steps?.map((s) => s.name)).not.toContain(
			"choose:add_bundle_to_cart.bundle",
		);
	});

	test("the facts survive a checkpoint: the same preference is rebuilt from state alone", async () => {
		const actions = await catalog(SEARCH, ADD, BOOK);
		const base = request("book IMAX Laser");
		const state = { ...base, ...matchSpecialist(actions, base) };
		const restored: WorldState = JSON.parse(JSON.stringify(state));
		const steps = plan(restored, goal, preferSpecialist(actions, restored));
		expect(steps?.map((s) => s.name)).toEqual(["book_tickets"]);
	});

	test("preferSpecialist leaves the shared catalog untouched", async () => {
		const actions = await catalog(ADD, BUNDLE);
		const before = actions.map((a) => a.cost);
		const state = { ...request("x"), specialistTool: "add_bundle_to_cart" };
		preferSpecialist(actions, state);
		expect(actions.map((a) => a.cost)).toEqual(before);
	});
});

describe("the matched tool's call", () => {
	test("sends the matched value as its argument, with no model asked", async () => {
		const actions = await catalog(ADD, BUNDLE);
		const base = request("add Home Office Starter Kit");
		const state = { ...base, ...matchSpecialist(actions, base) };
		const bundle = actions.find((a) => a.name === "add_bundle_to_cart");
		const result = await bundle?.execute({ state });
		expect(result).toEqual({
			waiting: {
				kind: "webmcp_tool_call",
				payload: {
					tool: "add_bundle_to_cart",
					arguments: { bundle: "Home Office Starter Kit" },
				},
			},
		});
	});
});
