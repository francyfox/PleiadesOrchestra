import { describe, expect, test } from "bun:test";
import {
	bindListScope,
	countedItems,
	findZeroField,
	looksEmpty,
	parseListedItems,
	removalArguments,
	scopeFacts,
} from "#core/goap/list-removal";
import type { GoapAction } from "#core/goap/types";

const CART_ANSWER = [
	"Greenleaf Market cart (3 items):",
	"- 1 × Spaghetti (16 oz) — $1.79",
	"- 2 × Tomatoes on the Vine (1 lb) — $5.98",
	"- Sea Salt (26 oz) — $2.99",
	"Shopping for these recipes: Simple Tomato Pasta.",
	"Subtotal $10.76. Delivery $0.00.",
].join("\n");

describe("parseListedItems", () => {
	test("every listed line becomes an item: leading count stripped, price and size cut off", () => {
		expect(parseListedItems(CART_ANSWER)).toEqual([
			{ name: "Spaghetti", quantity: 1 },
			{ name: "Tomatoes on the Vine", quantity: 2 },
			{ name: "Sea Salt", quantity: 1 },
		]);
	});

	test("numbered lists, «x» counts and unbulleted count lines", () => {
		const text =
			"Your basket:\n1. 3 x Oat Milk - $4.00\n2) Rye Bread\n2 × Apples";
		expect(parseListedItems(text)).toEqual([
			{ name: "Oat Milk", quantity: 3 },
			{ name: "Rye Bread", quantity: 1 },
			{ name: "Apples", quantity: 2 },
		]);
	});

	test("a leading #id names the entry (bookings listed by number)", () => {
		const text =
			"Bookings:\n- #A12 Haircut with Anna — Tue 10:00\n- #B7 Massage — Wed";
		expect(parseListedItems(text)).toEqual([
			{ name: "A12", quantity: 1 },
			{ name: "B7", quantity: 1 },
		]);
	});

	test("an answer without a list has no items", () => {
		expect(parseListedItems("The cart is empty.")).toEqual([]);
	});
});

describe("looksEmpty", () => {
	test("says so in English and Russian", () => {
		expect(looksEmpty("The Greenleaf Market cart is empty. Use search.")).toBe(
			true,
		);
		expect(looksEmpty("You have no bookings")).toBe(true);
		expect(looksEmpty("Корзина пуста")).toBe(true);
		expect(looksEmpty(CART_ANSWER)).toBe(false);
	});
});

const UPDATE_ITEM = {
	type: "object",
	properties: {
		product: { type: "string" },
		quantity: {
			type: "integer",
			minimum: 0,
			maximum: 24,
			description:
				"The new total quantity for this product. 0 removes it from the cart.",
		},
	},
	required: ["product", "quantity"],
};

describe("removal arguments from the schema", () => {
	test("the numeric field that removes at 0 is found, not guessed from its name", () => {
		expect(findZeroField(UPDATE_ITEM)).toBe("quantity");
		expect(
			findZeroField({
				type: "object",
				properties: {
					slot_id: { type: "string" },
					n: {
						type: "integer",
						minimum: 0,
						description: "Use 0 to delete the slot",
					},
				},
				required: ["slot_id", "n"],
			}),
		).toBe("n");
		// A minimum of 0 on an optional paging parameter is not a removal switch.
		expect(
			findZeroField({
				type: "object",
				properties: {
					name: { type: "string" },
					offset: { type: "integer", minimum: 0 },
				},
				required: ["name"],
			}),
		).toBeUndefined();
	});

	test("one item: its name in the string field, 0 in the removing number", () => {
		expect(
			removalArguments(UPDATE_ITEM, [{ name: "Spaghetti", quantity: 1 }]),
		).toEqual({
			product: "Spaghetti",
			quantity: 0,
		});
	});

	test("a tool with only a name parameter gets only the name", () => {
		expect(
			removalArguments(
				{
					type: "object",
					properties: { booking_id: { type: "string" } },
					required: ["booking_id"],
				},
				[{ name: "A12", quantity: 1 }],
			),
		).toEqual({ booking_id: "A12" });
	});

	test("a tool that takes a list gets every item in one call", () => {
		const schema = {
			type: "object",
			properties: {
				items: {
					type: "array",
					items: {
						type: "object",
						properties: {
							product: { type: "string" },
							quantity: { type: "integer", minimum: 0 },
						},
						required: ["product"],
					},
				},
			},
		};
		expect(
			removalArguments(schema, [
				{ name: "A", quantity: 2 },
				{ name: "B", quantity: 1 },
			]),
		).toEqual({
			items: [
				{ product: "A", quantity: 0 },
				{ product: "B", quantity: 0 },
			],
		});
	});

	test("nothing to put a name into: undefined", () => {
		expect(
			removalArguments({ type: "object", properties: {} }, [
				{ name: "A", quantity: 1 },
			]),
		).toBeUndefined();
	});
});

describe("scope «every item»", () => {
	test("only a removal that says «all» gets the scope fact", () => {
		const base = { messageIntent: "removeFromCart" };
		expect(
			scopeFacts({ ...base, userMessage: "удали все из корзины" }),
		).toEqual({ scopeAll: true });
		expect(
			scopeFacts({
				...base,
				userMessage: "x",
				userMessageEn: "remove everything",
			}),
		).toEqual({ scopeAll: true });
		expect(
			scopeFacts({ ...base, userMessage: "remove the cheese" }),
		).toBeUndefined();
		expect(
			scopeFacts({ messageIntent: "addToCart", userMessage: "add all" }),
		).toBeUndefined();
	});

	const action = (name: string, extra: Partial<GoapAction>): GoapAction => ({
		name,
		cost: 3,
		preconditions: {},
		effects: {},
		execute: async () => ({}),
		...extra,
	});
	const remover = action("update_cart_item", {
		effects: { inCart: false },
		scopedPreconditions: { listRead: true },
	});
	const clearer = action("clear_cart", { effects: { inCart: false } });
	const cart = action("get_cart", { effects: { listRead: true } });
	const staples = action("get_staples", { effects: { listRead: true } });

	test("the remover waits for the list, read by the tool that shares a word with it", () => {
		const bound = bindListScope([remover, clearer, cart, staples], {
			scopeAll: true,
		});
		expect(
			bound.find((a) => a.name === "update_cart_item")?.preconditions,
		).toEqual({ listRead: true });
		expect(bound.find((a) => a.name === "clear_cart")?.preconditions).toEqual(
			{},
		);
		expect(bound.find((a) => a.name === "get_cart")?.effects).toEqual({
			listRead: true,
		});
		expect(bound.find((a) => a.name === "get_staples")?.effects).toEqual({});
	});

	test("without the scope, or without any reader, nothing changes", () => {
		const actions = [remover, cart];
		expect(bindListScope(actions, {})).toBe(actions);
		const noReader = [remover, clearer];
		expect(bindListScope(noReader, { scopeAll: true })).toBe(noReader);
	});
});

describe("countedItems", () => {
	test("every «N × Name» of a free-text answer, size and notes cut", () => {
		expect(
			countedItems(
				"Simple Tomato Pasta at Greenleaf Market:\nAdded: 1 × Spaghetti (not in their order history); 2 × Tomatoes on the Vine (not in their order history); 1 × Extra Virgin Olive Oil — $9.99\nAlready in your cart: Garlic.",
			),
		).toEqual([
			{ name: "Spaghetti", quantity: 1 },
			{ name: "Tomatoes on the Vine", quantity: 2 },
			{ name: "Extra Virgin Olive Oil", quantity: 1 },
		]);
	});

	test("a hardware bundle answer with «x» and a bulleted list", () => {
		expect(
			countedItems("Bundle added:\n- 1 x USB-C Hub\n- 2 x HDMI Cable (2 m)"),
		).toEqual([
			{ name: "USB-C Hub", quantity: 1 },
			{ name: "HDMI Cable", quantity: 2 },
		]);
	});

	test("no counted items → empty", () => {
		expect(countedItems("Done. Your order is on its way.")).toEqual([]);
	});
});
