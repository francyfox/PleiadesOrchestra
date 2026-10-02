/**
 * The Basketful demo's tools (apps/shopping-cart-webmcp/src/tools/definitions.js),
 * as `document.modelContext` lists them: name, description, JSON-schema input.
 * Copied rather than imported — the demo is its own nested repo.
 */
export interface ToolSpec {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

const STORES = ["Greenleaf Market", "Harbor Foods Co-op", "Penny Pantry"];
const DEPARTMENTS = [
	"Produce",
	"Dairy & Eggs",
	"Bakery",
	"Meat & Seafood",
	"Pantry",
	"Frozen",
	"Beverages",
	"Snacks",
	"Household",
];
const RECIPES = [
	"Simple Tomato Pasta",
	"Weeknight Beef Tacos",
	"Guacamole & Chips",
	"Sheet-Pan Salmon & Broccoli",
	"Cheddar & Spinach Scramble",
	"Tomato & Basil Bruschetta",
	"Banana Oat Pancakes",
];
const DIETARY = ["organic", "vegan", "gluten-free", "dairy-free"];

export const TOOLS: Record<string, ToolSpec> = {
	choose_store: {
		name: "choose_store",
		description:
			"Open one of Basketful's grocery stores so the shopper can browse and order from it. Each store has its own cart, prices, and delivery fee. Use this first when no store is open, or when the shopper asks to switch stores.",
		inputSchema: {
			type: "object",
			properties: {
				store: {
					type: "string",
					enum: STORES,
					description:
						"Greenleaf Market: everyday groceries, fastest. Harbor Foods Co-op: organic, pricier. Penny Pantry: lowest prices.",
				},
			},
			required: ["store"],
		},
	},
	search_products: {
		name: "search_products",
		description:
			"Search the open store's catalog and show the results on the page. Every filter is optional: combine a text query with a department, dietary needs, or a price cap, or pass only a department to browse an aisle. Search one kind of product per call.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"Product words as the shopper said them, e.g. 'corn tortillas' or 'oat milk'.",
				},
				department: {
					type: "string",
					enum: DEPARTMENTS,
					description: "Limit results to one department (aisle).",
				},
				dietary: {
					type: "array",
					items: { type: "string", enum: DIETARY },
					description:
						"Only return products that meet every listed dietary need.",
				},
				max_price: {
					type: "number",
					description:
						"Highest price per item in dollars, e.g. 5 for 'under $5'.",
				},
			},
		},
	},
	add_to_cart: {
		name: "add_to_cart",
		description:
			"Add one or more products to the open store's cart. Takes a list, so a whole shopping list can go in one call. Quantities add to whatever is already in the cart.",
		inputSchema: {
			type: "object",
			properties: {
				items: {
					type: "array",
					minItems: 1,
					description: "The products to add.",
					items: {
						type: "object",
						properties: {
							product: {
								type: "string",
								description:
									"Product name as shown in search_products results, e.g. 'Corn Tortillas'.",
							},
							quantity: {
								type: "integer",
								minimum: 1,
								maximum: 99,
								description: "How many to add. Defaults to 1.",
							},
						},
						required: ["product"],
					},
				},
			},
			required: ["items"],
		},
	},
	update_cart_item: {
		name: "update_cart_item",
		description:
			"Set the exact quantity of a product that is already in the open store's cart, or remove it by setting the quantity to 0. Use this when the shopper changes their mind about an amount.",
		inputSchema: {
			type: "object",
			properties: {
				product: {
					type: "string",
					description:
						"Product name as shown in search_products results, e.g. 'Corn Tortillas'.",
				},
				quantity: {
					type: "integer",
					minimum: 0,
					maximum: 99,
					description:
						"The new total quantity for this product. 0 removes it from the cart.",
				},
			},
			required: ["product", "quantity"],
		},
	},
	add_recipe_to_cart: {
		name: "add_recipe_to_cart",
		description:
			"Add what a recipe needs to the open store's cart, skipping what the shopper already has. Use `recipe` for one of Basketful's recipes, or `ingredients` for a recipe from anywhere.",
		inputSchema: {
			type: "object",
			properties: {
				recipe: {
					type: "string",
					enum: RECIPES,
					description: "One of Basketful's own recipes.",
				},
				ingredients: {
					type: "array",
					description:
						"For a recipe from anywhere else: every ingredient it calls for.",
					items: {
						type: "object",
						properties: {
							name: {
								type: "string",
								description:
									"The ingredient as the recipe writes it, e.g. '2 large tomatoes, diced' or 'olive oil'.",
							},
							quantity: {
								type: "integer",
								minimum: 1,
								maximum: 12,
								description:
									"How many of the store's unit to buy, when it's clear (3 avocados). Leave out otherwise.",
							},
						},
						required: ["name"],
					},
				},
				recipe_name: {
					type: "string",
					description:
						"What to call a recipe passed as ingredients, e.g. 'Grandma's salsa'.",
				},
				already_have: {
					type: "array",
					items: { type: "string" },
					description:
						"Ingredients the shopper says they have. They are left out (or taken back out) and remembered.",
				},
				preview: {
					type: "boolean",
					description:
						"true returns the plan without changing the cart, for 'what would I need to buy?'.",
				},
			},
		},
	},
	get_cart: {
		name: "get_cart",
		description:
			"Read the open store's cart: each item with its quantity and price, the subtotal, estimated fees and total.",
		inputSchema: { type: "object", properties: {} },
	},
};
