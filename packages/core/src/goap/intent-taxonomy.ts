import type { WorldState } from "./types";

/**
 * Fixed e-commerce intent taxonomy a WebMCP/MCP tool call can fall under.
 * Shared between two different Laya classification points (see
 * apps/docs/content/en/drafts/laya-autonomous-webmcp.md): per-tool, at catalog-build time
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
	"readState",
	"other",
] as const;

export type ToolIntent = (typeof TOOL_INTENTS)[number];

/**
 * One short line per intent, passed to Laya as the `choice` criteria
 * descriptions — the cases the lexical cues (`message-cues.ts`, `tool-cues.ts`)
 * leave to it. This is the shop-domain layer. Bare labels were easy to confuse
 * ("go to the Greenleaf market" came back as `checkout`), so each option says
 * what it means. English only (Laya reads English; the message is translated
 * first) and short on purpose: Laya shares one 192-token budget between all
 * options of a question and silently cuts them when over it, so a big question
 * is asked in rounds (`choice-rounds.ts`) and a guard test keeps every round
 * inside the estimated budget.
 */
export const INTENT_DESCRIPTIONS: Record<ToolIntent, string> = {
	chooseStore: "go to or switch to a particular store",
	navigate: "open a page of the site: cart, orders",
	search: "look for products or ask what is available",
	filter: "narrow products by diet, price or department",
	select: "open or pick one product from the results",
	addToCart: "buy a product or put it in the cart",
	removeFromCart: "take a product out of the cart",
	checkout: "pay and place the order",
	paginate: "show more results, next page",
	compare: "compare two or more products",
	readState: "only read what the site holds now: the cart, bookings",
	other: "anything else",
};

/**
 * What Laya may choose from, for a tool and for a message. `readState` is not
 * an option: it is a tool's role (read the current list, so a request about
 * «every item» knows the items), recognised by the tool's name
 * (`intentFromToolCues`) — a shopper never asks for it, and a sixth-hand
 * description line only gave a 1B classifier one more way to be wrong.
 */
export const LAYA_INTENT_DESCRIPTIONS: Record<string, string> =
	Object.fromEntries(
		Object.entries(INTENT_DESCRIPTIONS).filter(
			([intent]) => intent !== "readState",
		),
	);

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
	readState: { listRead: true },
	other: {},
};

/**
 * Best-effort ordering heuristic — not a guarantee. A tool's real dependency
 * order isn't recoverable from name/description alone (no MCP/WebMCP tool
 * descriptor carries dependency metadata); this is a generic e-commerce
 * default. A plan that gets it wrong isn't wrong forever: the real call
 * just returns an error/different effect and `runPlan`'s replanning already
 * handles that (see `executor.ts`) — at the cost of one extra tool call,
 * not a crash. See apps/docs/content/en/drafts/laya-autonomous-webmcp.md, "Limitations".
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
	readState: { storeOpen: true },
	other: {},
};

/**
 * Facts that stay true between turns of one conversation: the store the
 * shopper is in, and the product the last search found (`lastProduct`, empty
 * after a failed one) — so «now buy them» needs no second search. Everything else a run produces (`catalogSearched`,
 * `inCart`, tool results, the reply text) belongs to that one request and is
 * dropped when it ends, so "buy milk" after "buy cheese" starts from a search
 * again instead of believing it already searched.
 */
export const SESSION_FACTS = ["storeOpen", "store", "lastProduct"] as const;
