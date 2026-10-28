import type { ToolOption } from "#core/goap/tool-choice";

/**
 * Sites without an intent set and messages for `chooseTool`, with the tool a
 * person would call (`chat` = no tool). Several domains on purpose; messages
 * are the English text the planner reads. Checkout and removal words never
 * reach `chooseTool` (the guarded flow takes them), so they are not here.
 */
export interface ToolChoiceSite {
	site: string;
	tools: ToolOption[];
	cases: { message: string; expected: string }[];
}

export const TOOL_CHOICE_SITES: ToolChoiceSite[] = [
	{
		// apps/shopping-cart-webmcp, descriptions as the page announces them.
		site: "Basketful (groceries)",
		tools: [
			{
				name: "choose_store",
				description:
					"Open one of Basketful's grocery stores so the shopper can browse and order from it. Each store has its own cart, prices, and delivery fee. Use this first when no store is open, or when the shopper asks to switch stores.",
			},
			{
				name: "search_products",
				description:
					"Search the open store's catalog and show the results on the page. Every filter is optional: combine a text query with a department, dietary needs, or a price cap, or pass only a department to browse an aisle.",
			},
			{
				name: "add_to_cart",
				description:
					"Add one or more products to the open store's cart. Takes a list, so a whole shopping list can go in one call. Quantities add to whatever is already in the cart.",
			},
			{
				name: "update_cart_item",
				description:
					"Set the exact quantity of a product that is already in the open store's cart, or remove it by setting the quantity to 0. Use this when the shopper changes their mind about an amount; use add_to_cart to put new products in the cart.",
			},
			{
				name: "get_cart",
				description:
					"Read the open store's cart: each item with its quantity and price, the subtotal, estimated fees and total, and whether the store's order minimum is met.",
			},
			{
				name: "get_staples",
				description:
					"Read the shopper's saved staples (the page calls them 'Your usuals'): the products they buy regularly, each with its usual quantity and what to do when it is out of stock.",
			},
			{
				name: "update_staples",
				description:
					"Save products to the shopper's staples list, change their usual quantity or their out-of-stock rule, or remove them. This edits the saved list only; use add_staples_to_cart to put staples in the cart.",
			},
			{
				name: "add_staples_to_cart",
				description:
					"Put the shopper's saved staples in the open store's cart. Use it when they ask for their staples, 'the usual', or their regular order.",
			},
			{
				name: "add_recipe_to_cart",
				description:
					"Add what a recipe needs to the open store's cart, skipping what the shopper already has. Use `recipe` for one of Basketful's recipes, or `ingredients` for a recipe from anywhere.",
			},
			{
				name: "get_order_status",
				description:
					"Check on an order that was already placed: its stage (order placed, shopping, out for delivery, or delivered), delivery window, shopper, items, and total.",
			},
		],
		cases: [
			{
				message: "buy Toilet Paper, Laundry Detergent",
				expected: "add_to_cart",
			},
			{ message: "buy shampoo and dish soap", expected: "add_to_cart" },
			{ message: "add 2 milk and a loaf of bread", expected: "add_to_cart" },
			{ message: "I need paper towels", expected: "add_to_cart" },
			{ message: "buy the usual", expected: "add_staples_to_cart" },
			{
				message: "add my staples to the cart",
				expected: "add_staples_to_cart",
			},
			{
				message: "add everything for Simple Tomato Pasta",
				expected: "add_recipe_to_cart",
			},
			{
				message: "I want to cook lasagna, add the ingredients",
				expected: "add_recipe_to_cart",
			},
			{ message: "find gluten-free bread", expected: "search_products" },
			{ message: "do you have oat milk?", expected: "search_products" },
			{ message: "what's in my cart?", expected: "get_cart" },
			{ message: "where is my order?", expected: "get_order_status" },
			{ message: "what are my usuals?", expected: "get_staples" },
			{ message: "save eggs to my staples list", expected: "update_staples" },
			{ message: "switch to Penny Pantry", expected: "choose_store" },
			{ message: "change the milk to 3", expected: "update_cart_item" },
			{ message: "hi there", expected: "chat" },
		],
	},
	{
		// apps/docs/static/playground-demos/pizza-maker
		site: "Pizza Maker",
		tools: [
			{
				name: "set_pizza_size",
				description:
					"Set the pizza size directly or infer it based on the number of people.",
			},
			{
				name: "set_pizza_style",
				description: "Set the style of the pizza (colors/theme)",
			},
			{
				name: "toggle_layer",
				description:
					'Control pizza layers (sauce, cheese). Use "add", "remove", or "toggle".',
			},
			{
				name: "add_topping",
				description: "Add one or more toppings to the pizza",
			},
			{ name: "manage_pizza", description: "Manage pizza state" },
			{
				name: "share_pizza",
				description: "Get a shareable URL for the current pizza creation",
			},
		],
		cases: [
			{ message: "make it large", expected: "set_pizza_size" },
			{ message: "a pizza for 6 people", expected: "set_pizza_size" },
			{ message: "add pepperoni and mushrooms", expected: "add_topping" },
			{ message: "turn off the sauce", expected: "toggle_layer" },
			{ message: "give me a link to share it", expected: "share_pizza" },
			{ message: "make it look neon", expected: "set_pizza_style" },
			{ message: "thanks!", expected: "chat" },
		],
	},
	{
		// apps/docs/static/playground-demos/explainer
		site: "Consultation booking",
		tools: [
			{
				name: "getAvailability",
				description:
					"List bookable consultation times within a date range. Returns an object keyed by ISO date with arrays of 24h HH:MM times.",
			},
			{
				name: "bookSlot",
				description:
					"Reserve a 30-minute consultation at a specific date and time. Drives the on-page booking widget so the user sees what was booked.",
			},
		],
		cases: [
			{
				message: "what times are free next week?",
				expected: "getAvailability",
			},
			{ message: "book me on 2026-11-03 at 14:00", expected: "bookSlot" },
			{ message: "is Friday afternoon open?", expected: "getAvailability" },
		],
	},
	{
		// apps/docs/static/playground-demos/ticket-booking
		site: "CineFlow (cinema)",
		tools: [
			{ name: "update_location", description: "Updates the user's location." },
			{
				name: "query_content",
				description: "Filters the movie catalog by a specific genre.",
			},
			{
				name: "select_showtime",
				description:
					"Selects a movie and a specific showtime to initiate the checkout process.",
			},
		],
		cases: [
			{ message: "I'm in Paris", expected: "update_location" },
			{ message: "show me horror movies", expected: "query_content" },
			{
				message: "two tickets for the 8:30 PM show of Dune",
				expected: "select_showtime",
			},
		],
	},
];
