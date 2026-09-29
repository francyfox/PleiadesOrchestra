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

/** The single place domain semantics ("online shop") live — not in the tools, not in Laya. */
export const EFFECTS_BY_INTENT: Record<ToolIntent, Partial<WorldState>> = {
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
	search: {},
	filter: { catalogSearched: true },
	select: {},
	addToCart: { itemSelected: true },
	removeFromCart: {},
	checkout: { inCart: true },
	paginate: {},
	compare: {},
	other: {},
};
