import type { ToolIntent } from "./intent-taxonomy";

/**
 * What a WebMCP tool does, read from its NAME. Laya, sorting tools by name and
 * description, called `get_cart`, `get_order_status`, `update_cart_item` and
 * five more of a real shop's eleven tools `addToCart` — every description
 * mentions the cart — and `add_recipe_to_cart` was then as good a way to add
 * cheese as `add_to_cart`. A tool name is a short, deliberate label
 * (`verb_object`); its verb says what it does. The description is never read
 * here: it is prose about everything the tool touches.
 */

/** Words of a name: `addToCart`, `add-to-cart` and `add_to_cart` are the same. */
function tokens(name: string): string[] {
	return name
		.replace(/([a-z\d])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z\d]+/)
		.filter(Boolean);
}

const has = (words: readonly string[], ...candidates: string[]) =>
	candidates.some((candidate) => words.includes(candidate));

const READS = [
	"get",
	"list",
	"read",
	"view",
	"show",
	"fetch",
	"check",
	"status",
	"history",
];
const EDITS = [
	"update",
	"set",
	"save",
	"change",
	"edit",
	"modify",
	"configure",
];
const CART = ["cart", "basket", "bag"];
const STORE = ["store", "shop", "market"];

/** `undefined` when the name decides nothing and Laya should. */
export function intentFromToolCues(tool: {
	name: string;
	description?: string;
}): ToolIntent | undefined {
	const words = tokens(tool.name);
	if (words.length === 0) return undefined;

	if (has(words, "remove", "delete", "clear", "empty")) return "removeFromCart";
	if (has(words, "checkout", "pay", "purchase")) return "checkout";
	if (words.includes("place") && words.includes("order")) return "checkout";
	if (has(words, "compare")) return "compare";
	if (has(words, "paginate", "next", "previous")) return "paginate";
	if (
		has(words, "choose", "select", "switch", "open") &&
		has(words, ...STORE)
	) {
		return "chooseStore";
	}
	if (has(words, "search", "find", "lookup", "query")) return "search";
	if (has(words, "filter", "sort")) return "filter";
	if (has(words, "navigate", "goto", "go")) return "navigate";
	// What only reads or only edits the shopper's own lists/settings leaves the
	// cart, the catalog and the order as they were.
	if (has(words, ...READS) || has(words, ...EDITS)) return "other";
	if (has(words, "add", "put", "buy", "order") && has(words, ...CART)) {
		return "addToCart";
	}
	return undefined;
}

/** The words that already say what an intent's plain tool does; anything else in a name narrows it. */
const CORE_WORDS: Partial<Record<ToolIntent, readonly string[]>> = {
	addToCart: [
		"add",
		"to",
		"put",
		"buy",
		"in",
		"into",
		"item",
		"items",
		"product",
		"products",
		"cart",
		"basket",
		"bag",
	],
	removeFromCart: [
		"remove",
		"delete",
		"from",
		"item",
		"items",
		"product",
		"products",
		"cart",
		"basket",
		"bag",
	],
	search: [
		"search",
		"find",
		"lookup",
		"query",
		"product",
		"products",
		"item",
		"items",
		"catalog",
		"store",
	],
	chooseStore: [
		"choose",
		"select",
		"switch",
		"open",
		"set",
		"store",
		"shop",
		"market",
	],
	checkout: [
		"start",
		"begin",
		"go",
		"to",
		"place",
		"order",
		"checkout",
		"pay",
		"purchase",
		"the",
		"my",
	],
	filter: ["filter", "sort", "results", "product", "products", "by"],
	navigate: ["navigate", "go", "to", "goto", "open", "page"],
	paginate: ["next", "previous", "page", "paginate", "results"],
	compare: ["compare", "product", "products", "items", "item"],
};

const MAX_SPECIALIST_PENALTY = 3;

/**
 * Extra cost for a tool whose name carries qualifiers its intent's plain tool
 * doesn't (`add_recipe_to_cart`, `add_staples_to_cart` next to `add_to_cart`):
 * a specialist is for the special case, so for «купи 1 сыр» the plain tool must
 * win the tie. One point per extra word, at most three.
 */
export function specialistPenalty(name: string, intent: ToolIntent): number {
	const core = CORE_WORDS[intent];
	if (!core) return 0;
	const extra = tokens(name).filter((word) => !core.includes(word));
	return Math.min(extra.length, MAX_SPECIALIST_PENALTY);
}
