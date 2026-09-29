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
