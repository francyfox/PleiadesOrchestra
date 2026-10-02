import type { IngredientsCheck } from "./score.ts";
import { TOOLS, type ToolSpec } from "./tools.ts";

export type Lang = "en" | "ru";

export interface Case {
	id: string;
	tool: ToolSpec;
	/** Facts the planner already knows (open store, parsed product, …). */
	facts: Record<string, string | number | boolean>;
	/** What the previous tool answered, if this step depends on it. */
	answer?: string;
	/** The request as the shopper wrote it (`ru`) and as Vikhr would translate it (`en`). */
	request: Record<Lang, string>;
	expected: Record<string, unknown>;
	/** For open-ended answers (a recipe's ingredients): judged by content instead of `expected`. */
	check?: IngredientsCheck;
	lang: Lang;
}

const CHEESE = `Showing 4 of 4 results at Penny Pantry:
- Sharp Cheddar Cheese — $5.49 (8 oz block) — in stock
- Shredded Mexican Blend Cheese — $4.29 (8 oz) — OUT OF STOCK
- Goat Cheese Log — $5.99 (4 oz) — in stock
- Cream Cheese — $3.49 (8 oz) — in stock`;

const APPLE = `Showing 2 of 2 results at Penny Pantry:
- Honeycrisp Apples — $1.49 (each) — in stock
- Granny Smith Apples — $0.99 (each) — in stock`;

const MILK = `Showing 4 of 4 results at Penny Pantry:
- Whole Milk — $4.29 (1 gal) — in stock
- 2% Reduced Fat Milk — $4.29 (1 gal) — in stock
- Oat Milk — $4.99 (64 fl oz) — in stock
- Unsweetened Almond Milk — $3.99 (64 fl oz) — in stock`;

const BANANA = `Showing 2 of 2 results at Penny Pantry:
- Bananas — $0.29 (each) — in stock
- Organic Bananas — $0.39 (each) — in stock`;

const PIZZA: IngredientsCheck = {
	mustInclude: [
		["mozzarella"],
		["tomato"],
		["basil"],
		["flour", "dough", "crust"],
	],
	maxItems: 10,
};

const STORE = { store: "Penny Pantry", storeOpen: true };

interface Spec {
	id: string;
	tool: keyof typeof TOOLS;
	facts?: Case["facts"];
	answer?: string;
	en: string;
	ru: string;
	expected: Record<string, unknown>;
	check?: IngredientsCheck;
}

const SPECS: Spec[] = [
	// --- choose a store -------------------------------------------------
	{
		id: "store-named",
		tool: "choose_store",
		en: "open Penny Pantry",
		ru: "открой Penny Pantry",
		expected: { store: "Penny Pantry" },
	},
	{
		id: "store-cheapest",
		tool: "choose_store",
		en: "go to the cheapest store",
		ru: "зайди в самый дешёвый магазин",
		expected: { store: "Penny Pantry" },
	},
	{
		id: "store-organic",
		tool: "choose_store",
		en: "I want organic food",
		ru: "хочу органические продукты",
		expected: { store: "Harbor Foods Co-op" },
	},
	{
		id: "store-fastest",
		tool: "choose_store",
		en: "whichever store delivers fastest",
		ru: "где быстрее всего доставят",
		expected: { store: "Greenleaf Market" },
	},
	{
		id: "store-switch",
		tool: "choose_store",
		en: "switch to Harbor Foods",
		ru: "перейди в Harbor Foods",
		expected: { store: "Harbor Foods Co-op" },
	},

	// --- search ---------------------------------------------------------
	{
		id: "search-cheese",
		tool: "search_products",
		facts: STORE,
		en: "buy 1 cheese",
		ru: "купи 1 сыр",
		expected: { query: "cheese" },
	},
	{
		id: "search-apple",
		tool: "search_products",
		facts: STORE,
		en: "buy 1 apple",
		ru: "купи 1 яблоко",
		expected: { query: "apple" },
	},
	{
		id: "search-price",
		tool: "search_products",
		facts: STORE,
		en: "find oat milk under 5 dollars",
		ru: "найди овсяное молоко дешевле 5 долларов",
		expected: { query: "oat milk", max_price: 5 },
	},
	{
		id: "search-vegan",
		tool: "search_products",
		facts: STORE,
		en: "vegan chips",
		ru: "веганские чипсы",
		expected: { query: "chips", dietary: ["vegan"] },
	},
	{
		id: "search-aisle",
		tool: "search_products",
		facts: STORE,
		en: "show me the bakery aisle",
		ru: "покажи отдел выпечки",
		expected: { department: "Bakery" },
	},
	{
		id: "search-two-diets",
		tool: "search_products",
		facts: STORE,
		en: "gluten-free and dairy-free bread",
		ru: "хлеб без глютена и без молочных продуктов",
		expected: { query: "bread", dietary: ["gluten-free", "dairy-free"] },
	},
	{
		id: "search-all-filters",
		tool: "search_products",
		facts: STORE,
		en: "milk from the dairy section under $4.50",
		ru: "молоко из молочного отдела до 4.5 долларов",
		expected: { query: "milk", department: "Dairy & Eggs", max_price: 4.5 },
	},
	{
		id: "search-bananas",
		tool: "search_products",
		facts: STORE,
		en: "I need some bananas",
		ru: "мне нужны бананы",
		expected: { query: "bananas" },
	},
	{
		id: "search-organic",
		tool: "search_products",
		facts: STORE,
		en: "organic bananas",
		ru: "органические бананы",
		expected: { query: "bananas", dietary: ["organic"] },
	},
	{
		id: "search-yogurt",
		tool: "search_products",
		facts: STORE,
		en: "find yogurt",
		ru: "найди йогурт",
		expected: { query: "yogurt" },
	},
	{
		id: "search-kettle",
		tool: "search_products",
		facts: STORE,
		en: "kettle chips under 4 dollars",
		ru: "чипсы kettle дешевле 4 долларов",
		expected: { query: "kettle chips", max_price: 4 },
	},

	// --- add to cart: the product name comes from the last answer ------------
	{
		id: "add-first-cheese",
		tool: "add_to_cart",
		facts: { ...STORE, query: "cheese" },
		answer: CHEESE,
		en: "buy 1 cheese",
		ru: "купи 1 сыр",
		expected: { items: [{ product: "Sharp Cheddar Cheese", quantity: 1 }] },
	},
	{
		id: "add-three-apples",
		tool: "add_to_cart",
		facts: { ...STORE, query: "apple" },
		answer: APPLE,
		en: "add 3 apples",
		ru: "добавь 3 яблока",
		expected: { items: [{ product: "Honeycrisp Apples", quantity: 3 }] },
	},
	{
		id: "add-cream-cheese",
		tool: "add_to_cart",
		facts: { ...STORE, query: "cheese" },
		answer: CHEESE,
		en: "two cream cheese please",
		ru: "два сливочных сыра",
		expected: { items: [{ product: "Cream Cheese", quantity: 2 }] },
	},
	{
		id: "add-it",
		tool: "add_to_cart",
		facts: { ...STORE, product: "Whole Milk" },
		en: "put it in the cart",
		ru: "положи это в корзину",
		expected: { items: [{ product: "Whole Milk" }] },
	},
	{
		id: "add-oat-milk",
		tool: "add_to_cart",
		facts: { ...STORE, query: "milk" },
		answer: MILK,
		en: "add 5 oat milk",
		ru: "добавь 5 овсяного молока",
		expected: { items: [{ product: "Oat Milk", quantity: 5 }] },
	},
	{
		id: "add-apples-no-qty",
		tool: "add_to_cart",
		facts: { ...STORE, query: "apple" },
		answer: APPLE,
		en: "add apples",
		ru: "добавь яблоки",
		expected: { items: [{ product: "Honeycrisp Apples" }] },
	},
	{
		id: "add-two-bananas",
		tool: "add_to_cart",
		facts: { ...STORE, query: "bananas" },
		answer: BANANA,
		en: "add two bananas",
		ru: "добавь два банана",
		expected: { items: [{ product: "Bananas", quantity: 2 }] },
	},

	// --- change the cart --------------------------------------------------
	{
		id: "update-set",
		tool: "update_cart_item",
		facts: { ...STORE, product: "Whole Milk" },
		en: "make it 3",
		ru: "сделай 3",
		expected: { product: "Whole Milk", quantity: 3 },
	},
	{
		id: "update-remove",
		tool: "update_cart_item",
		facts: { ...STORE, product: "Honeycrisp Apples" },
		en: "remove the apples",
		ru: "убери яблоки",
		expected: { product: "Honeycrisp Apples", quantity: 0 },
	},
	{
		id: "update-named",
		tool: "update_cart_item",
		facts: STORE,
		en: "change cream cheese to 4",
		ru: "измени сливочный сыр на 4",
		expected: { product: "Cream Cheese", quantity: 4 },
	},
	{
		id: "update-only-two",
		tool: "update_cart_item",
		facts: { ...STORE, product: "Honeycrisp Apples" },
		en: "I only want 2 of the apples",
		ru: "мне нужно только 2 яблока",
		expected: { product: "Honeycrisp Apples", quantity: 2 },
	},

	// --- heavy: needs knowledge of a dish ---------------------------------------
	{
		id: "recipe-pizza",
		tool: "add_recipe_to_cart",
		facts: STORE,
		en: "ingredients for a margherita pizza",
		ru: "ингредиенты для пиццы маргариты",
		expected: {},
		check: PIZZA,
	},
	{
		id: "recipe-carbonara",
		tool: "add_recipe_to_cart",
		facts: STORE,
		en: "everything I need for spaghetti carbonara",
		ru: "всё для спагетти карбонара",
		expected: {},
		check: {
			mustInclude: [
				["spaghetti", "pasta"],
				["egg"],
				["bacon", "pancetta", "guanciale"],
				["parmesan", "pecorino", "cheese"],
			],
			maxItems: 10,
		},
	},
	{
		id: "recipe-own",
		tool: "add_recipe_to_cart",
		facts: STORE,
		en: "everything for beef tacos",
		ru: "всё для тако с говядиной",
		expected: { recipe: "Weeknight Beef Tacos" },
	},
	{
		id: "recipe-preview",
		tool: "add_recipe_to_cart",
		facts: STORE,
		en: "what would I need to buy for a margherita pizza?",
		ru: "что нужно купить для пиццы маргариты?",
		expected: {},
		check: { ...PIZZA, exact: { preview: true } },
	},
	{
		id: "recipe-guacamole",
		tool: "add_recipe_to_cart",
		facts: STORE,
		en: "ingredients for guacamole",
		ru: "ингредиенты для гуакамоле",
		expected: { recipe: "Guacamole & Chips" },
	},

	// --- tools without arguments ---------------------------------------------
	{
		id: "cart-show",
		tool: "get_cart",
		facts: STORE,
		en: "show my cart",
		ru: "покажи корзину",
		expected: {},
	},
	{
		id: "cart-contents",
		tool: "get_cart",
		facts: STORE,
		en: "what is in the basket",
		ru: "что у меня в корзине",
		expected: {},
	},
];

/** Every spec in the requested languages. */
export function buildCases(langs: readonly Lang[]): Case[] {
	return SPECS.flatMap((spec) =>
		langs.map(
			(lang): Case => ({
				id: `${spec.id}.${lang}`,
				tool: TOOLS[spec.tool] as ToolSpec,
				facts: spec.facts ?? {},
				answer: spec.answer,
				request: { en: spec.en, ru: spec.ru },
				expected: spec.expected,
				check: spec.check,
				lang,
			}),
		),
	);
}
