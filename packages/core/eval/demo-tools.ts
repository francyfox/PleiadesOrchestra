import type { ToolIntent } from "../src/goap/intent-taxonomy.ts";

/**
 * The eleven tools of the Basketful demo shop (`apps/shopping-cart-webmcp`),
 * as its page announces them (first sentence of each description), with the
 * intent each one really has. Add the tools of every real site that gets
 * misclassified.
 */
export const DEMO_TOOLS: {
	name: string;
	description: string;
	expected: ToolIntent;
}[] = [
	{
		name: "add_recipe_to_cart",
		description:
			"Add what a recipe needs to the open store's cart, skipping what the shopper already has.",
		expected: "addToCart",
	},
	{
		name: "add_staples_to_cart",
		description: "Put the shopper's saved staples in the open store's cart.",
		expected: "addToCart",
	},
	{
		name: "add_to_cart",
		description: "Add one or more products to the open store's cart.",
		expected: "addToCart",
	},
	{
		name: "choose_store",
		description:
			"Open one of Basketful's grocery stores so the shopper can browse and order from it.",
		expected: "chooseStore",
	},
	{
		name: "get_cart",
		description:
			"Read the open store's cart: each item with its quantity and price, the subtotal, estimated fees and total, and whether the store's order minimum is met.",
		expected: "other",
	},
	{
		name: "get_order_status",
		description:
			"Check on an order that was already placed: its stage (order placed, shopping, out for delivery, or delivered), delivery window, shopper, items, and total.",
		expected: "other",
	},
	{
		name: "get_staples",
		description:
			"Read the shopper's saved staples (the page calls them 'Your usuals'): the products they buy regularly, each with its usual quantity and what to do when it is out of stock.",
		expected: "other",
	},
	{
		name: "search_products",
		description:
			"Search the open store's catalog and show the results on the page.",
		expected: "search",
	},
	{
		name: "start_checkout",
		description: "Go to the checkout page for the open store's cart.",
		expected: "checkout",
	},
	{
		name: "update_cart_item",
		description:
			"Set the exact quantity of a product that is already in the open store's cart, or remove it by setting the quantity to 0.",
		expected: "other",
	},
	{
		name: "update_staples",
		description:
			"Save products to the shopper's staples list, change their usual quantity or their out-of-stock rule, or remove them.",
		expected: "other",
	},
];
