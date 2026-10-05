import type { WorldState } from "./types";

/**
 * Fixed e-commerce intent taxonomy a WebMCP/MCP tool call can fall under.
 * Shared between two different Laya classification points (see
 * docs/laya-autonomous-webmcp.md): per-tool, at catalog-build time
 * (`createClassifiedMcpToolSource`, proposed, not yet implemented), and
 * per-message, before planning (`message-intent.ts`, `classifyMessageIntent`).
 * Both need the same fixed, bounded set of options for Laya's `choice`
 * question — keeping it in one place is what keeps them in sync.
 */
export const TOOL_INTENTS = [
	"chooseStore",
	"navigate",
	"search",
	"filter",
	"select",
	"addToCart",
	"removeFromCart",
	"checkout",
	"paginate",
	"compare",
	"other",
] as const;

export type ToolIntent = (typeof TOOL_INTENTS)[number];

/**
 * One line per intent, passed to Laya as the `choice` criteria descriptions —
 * the cases the lexical cues (`message-cues.ts`, `tool-cues.ts`) leave to it.
 * Bare labels were easy to confuse ("go to the Greenleaf market" came back as
 * `checkout`), so each option says what it means and gives examples in both
 * languages; with examples Laya's accuracy on shopper messages went 55% → 68%
 * (`bun run eval:intents`).
 */
export const INTENT_DESCRIPTIONS: Record<ToolIntent, string> = {
	chooseStore:
		'go to, enter or switch to one particular store ("go to the Greenleaf market", "switch to another store", "перейди в магазин Penny Pantry")',
	navigate:
		'open a page of the site: the cart, orders, recipes ("open the cart", "show my orders", "открой корзину", "что в корзине")',
	search:
		'look for products or ask what is available ("find cheese", "do you have milk", "найди сыр", "что есть из молочки")',
	filter:
		'narrow the shown products by diet, price or department ("only vegan", "cheaper than 3 dollars", "только веганские")',
	select:
		'open or pick ONE product from the results ("open the first one", "tell me more about Brie", "расскажи про Brie")',
	addToCart:
		'buy a product or put it into the cart ("buy 1 cheese", "add milk", "купи сыр", "добавь молоко в корзину", "хочу яблоки")',
	removeFromCart:
		'take a product out of the cart ("remove the cheese", "убери молоко", "удали из корзины")',
	checkout:
		'pay and place the order, finish shopping ("checkout", "place my order", "оформи заказ", "оплатить")',
	paginate:
		'show the next or previous page of results ("show more", "next", "дальше")',
	compare:
		'compare two or more products ("compare these", "сравни Brie и Gouda", "что лучше")',
	other: "anything else that is not one of the above",
};

/** The single place domain semantics ("online shop") live — not in the tools, not in Laya. */
export const EFFECTS_BY_INTENT: Record<ToolIntent, Partial<WorldState>> = {
	chooseStore: { storeOpen: true },
	navigate: { pageOpened: true },
	search: { catalogSearched: true },
	filter: { catalogFiltered: true },
	select: { itemSelected: true },
	addToCart: { inCart: true },
	removeFromCart: { inCart: false },
	checkout: { checkoutComplete: true },
	paginate: {},
	compare: {},
	other: {},
};

/**
 * Best-effort ordering heuristic — not a guarantee. A tool's real dependency
 * order isn't recoverable from name/description alone (no MCP/WebMCP tool
 * descriptor carries dependency metadata); this is a generic e-commerce
 * default. A plan that gets it wrong isn't wrong forever: the real call
 * just returns an error/different effect and `runPlan`'s replanning already
 * handles that (see `executor.ts`) — at the cost of one extra tool call,
 * not a crash. See docs/laya-autonomous-webmcp.md, "Ограничения".
 */
export const PRECONDITIONS_BY_INTENT: Record<
	ToolIntent,
	Partial<WorldState>
> = {
	chooseStore: {},
	navigate: {},
	// `requestParsed`: what to look for / buy was pulled out of the user's
	// message first (see `product-request.ts`).
	search: { storeOpen: true, requestParsed: true },
	filter: { catalogSearched: true },
	select: { catalogSearched: true },
	addToCart: { storeOpen: true, catalogSearched: true, requestParsed: true },
	removeFromCart: { storeOpen: true },
	checkout: { inCart: true },
	paginate: {},
	compare: {},
	other: {},
};

/**
 * Facts that stay true between turns of one conversation: the store the
 * shopper is in. Everything else a run produces (`catalogSearched`,
 * `inCart`, tool results, the reply text) belongs to that one request and is
 * dropped when it ends, so "buy milk" after "buy cheese" starts from a search
 * again instead of believing it already searched.
 */
export const SESSION_FACTS = ["storeOpen", "store"] as const;
