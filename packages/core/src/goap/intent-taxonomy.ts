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
 * One line per intent, passed to Laya as the `choice` criteria descriptions.
 * Bare labels ("checkout", "search") were easy to confuse — "go to the
 * Greenleaf market" came back as `checkout` — so each option says what it
 * means and what it is not.
 */
export const INTENT_DESCRIPTIONS: Record<ToolIntent, string> = {
	chooseStore:
		'open, enter or switch to a particular store or shop ("go to the Greenleaf market")',
	navigate:
		'go to a page of the site ("open the cart", "show my orders") that is not a store or a search',
	search: 'look for or list products without buying them yet ("find cheese")',
	filter: "narrow the current results by price, department or diet",
	select: "open or pick one specific product from the results",
	addToCart:
		'buy, order or put a product into the cart ("buy 1 cheese", "add milk")',
	removeFromCart: "take a product out of the cart or reduce its quantity",
	checkout: "pay, place the order or finish the purchase",
	paginate: "show the next or previous page of results",
	compare: "compare two or more products with each other",
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
