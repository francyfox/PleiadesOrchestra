import { describe, expect, test } from "bun:test";
import type { DecisionAgent } from "#core/decision-types";
import { pruneUnproducibleFacts } from "#core/goap/catalog";
import { runPlan } from "#core/goap/executor";
import { bindListScope, scopeFacts } from "#core/goap/list-removal";
import { goalForIntent } from "#core/goap/message-intent";
import type { WorldState } from "#core/goap/types";
import {
	createWebMcpActions,
	type WebMcpToolCallPayload,
	type WebMcpToolDescriptor,
} from "#core/goap/webmcp-actions";

// Laya is never asked: every tool's name says what it does, and the one that
// does not (`update_cart_item`) is read from its schema.
const laya: DecisionAgent = {
	async decide() {
		return {};
	},
};

const tool = (
	name: string,
	properties: Record<string, unknown> = {},
	required: string[] = [],
): WebMcpToolDescriptor => ({
	name,
	description: "",
	inputSchema: { type: "object", properties, required },
});

const CHOOSE_STORE = tool(
	"choose_store",
	{ store: { type: "string", enum: ["Greenleaf Market"] } },
	["store"],
);
const GET_CART = tool("get_cart");
const UPDATE_CART_ITEM = tool(
	"update_cart_item",
	{
		product: { type: "string" },
		quantity: {
			type: "integer",
			minimum: 0,
			description: "The new total quantity. 0 removes it from the cart.",
		},
	},
	["product", "quantity"],
);

const CART_ANSWER =
	"Greenleaf Market cart (3 items):\n" +
	"- 1 × Spaghetti (16 oz) — $1.79\n" +
	"- 2 × Tomatoes on the Vine (1 lb) — $5.98\n" +
	"- 1 × Sea Salt (26 oz) — $2.99\n" +
	"Subtotal $10.76.";

/** Runs the turn, answering every browser call from `answer`. */
async function turn(
	tools: WebMcpToolDescriptor[],
	message: string,
	answer: (call: WebMcpToolCallPayload) => string,
	extra: WorldState = { storeOpen: true },
) {
	const catalog = pruneUnproducibleFacts(
		await createWebMcpActions({ tools, decisionAgent: laya }),
	);
	let state: WorldState = {
		userMessage: message,
		messageIntent: "removeFromCart",
		threadId: "t",
		userId: "u",
		...extra,
	};
	state = { ...state, ...scopeFacts(state) };
	const actions = bindListScope(catalog, state);
	const goal = goalForIntent("removeFromCart", {}, actions);
	const calls: WebMcpToolCallPayload[] = [];
	for (let i = 0; i < 30; i++) {
		const result = await runPlan({
			state,
			goal,
			actions,
			ctx: {},
			maxActionFailures: 2,
		});
		state = result.finalState;
		if (!result.waiting) return { calls, state, succeeded: result.succeeded };
		const payload = result.waiting.payload as WebMcpToolCallPayload;
		calls.push(payload);
		state = {
			...state,
			[`webmcp:${payload.tool}:result`]: "ok",
			[`webmcp:${payload.tool}:text`]: answer(payload),
		};
	}
	throw new Error("did not settle");
}

describe("«remove everything»: read the list, then remove each item", () => {
	test("get_cart, then update_cart_item once per listed item with 0 in the removing number", async () => {
		const { calls, succeeded, state } = await turn(
			[CHOOSE_STORE, GET_CART, UPDATE_CART_ITEM],
			"удали все из корзины",
			(call) => (call.tool === "get_cart" ? CART_ANSWER : "Removed."),
		);
		expect(calls.map((call) => call.tool)).toEqual([
			"get_cart",
			"update_cart_item",
			"update_cart_item",
			"update_cart_item",
		]);
		expect(calls.slice(1).map((call) => call.arguments)).toEqual([
			{ product: "Spaghetti", quantity: 0 },
			{ product: "Tomatoes on the Vine", quantity: 0 },
			{ product: "Sea Salt", quantity: 0 },
		]);
		expect(succeeded).toBe(true);
		expect(state.inCart).toBe(false);
		expect(JSON.parse(String(state.removedItems))).toHaveLength(3);
	});

	test("the reader is the tool named like the remover, not another reading tool", async () => {
		const { calls } = await turn(
			[CHOOSE_STORE, tool("get_staples"), GET_CART, UPDATE_CART_ITEM],
			"remove everything",
			(call) => (call.tool === "get_cart" ? CART_ANSWER : "Removed."),
		);
		expect(calls[0]?.tool).toBe("get_cart");
		expect(calls.some((call) => call.tool === "get_staples")).toBe(false);
	});

	test("without «all» a removal is one product and reads nothing", async () => {
		const { calls, succeeded } = await turn(
			[CHOOSE_STORE, GET_CART, UPDATE_CART_ITEM],
			"remove the cheese",
			() => "Removed Cheese.",
			{ storeOpen: true, product: "Cheese" },
		);
		expect(calls).toEqual([
			{
				tool: "update_cart_item",
				arguments: { product: "Cheese", quantity: 0 },
			},
		]);
		expect(succeeded).toBe(true);
	});

	test("a list that is empty ends without a single removal call, and says so", async () => {
		const { calls, succeeded, state } = await turn(
			[CHOOSE_STORE, GET_CART, UPDATE_CART_ITEM],
			"remove everything",
			() =>
				"The Greenleaf Market cart is empty. Use search_products to fill it.",
		);
		expect(calls.map((call) => call.tool)).toEqual(["get_cart"]);
		expect(succeeded).toBe(true);
		expect(state.listEmpty).toBe(true);
		expect(state.removedItems).toBeUndefined();
	});

	test("a list in a format this cannot read fails the step instead of guessing", async () => {
		const { calls, succeeded } = await turn(
			[CHOOSE_STORE, GET_CART, UPDATE_CART_ITEM],
			"remove everything",
			() => "You have a few things in there.",
		);
		expect(calls.map((call) => call.tool)).toEqual(["get_cart"]);
		expect(succeeded).toBe(false);
	});

	test("a tool that clears everything with no parameters beats the fan-out by cost", async () => {
		const { calls, succeeded } = await turn(
			[CHOOSE_STORE, GET_CART, UPDATE_CART_ITEM, tool("clear_cart")],
			"очисти корзину",
			() => "Cleared.",
		);
		expect(calls).toEqual([{ tool: "clear_cart", arguments: {} }]);
		expect(succeeded).toBe(true);
	});

	test("another domain: bookings listed by #id, cancelled one by one by id", async () => {
		const { calls, succeeded } = await turn(
			[
				tool("list_bookings"),
				tool("cancel_booking", { booking_id: { type: "string" } }, [
					"booking_id",
				]),
			],
			"cancel all my bookings",
			(call) =>
				call.tool === "list_bookings"
					? "Your bookings:\n- #A12 Haircut with Anna — Tue 10:00\n- #B7 Massage — Wed 15:00"
					: "Cancelled.",
			{ messageIntent: "removeFromCart" },
		);
		expect(calls).toEqual([
			{ tool: "list_bookings", arguments: {} },
			{ tool: "cancel_booking", arguments: { booking_id: "A12" } },
			{ tool: "cancel_booking", arguments: { booking_id: "B7" } },
		]);
		expect(succeeded).toBe(true);
	});

	test("a remover that takes a list gets everything in one call", async () => {
		const { calls } = await turn(
			[
				tool("view_basket"),
				tool(
					"remove_from_basket",
					{
						lines: {
							type: "array",
							items: {
								type: "object",
								properties: {
									sku: { type: "string" },
									count: { type: "integer", minimum: 0 },
								},
								required: ["sku"],
							},
						},
					},
					["lines"],
				),
			],
			"remove all",
			(call) => (call.tool === "view_basket" ? CART_ANSWER : "ok"),
			{},
		);
		expect(calls.map((call) => call.tool)).toEqual([
			"view_basket",
			"remove_from_basket",
		]);
		expect(calls[1]?.arguments).toEqual({
			lines: [
				{ sku: "Spaghetti", count: 0 },
				{ sku: "Tomatoes on the Vine", count: 0 },
				{ sku: "Sea Salt", count: 0 },
			],
		});
	});
});
