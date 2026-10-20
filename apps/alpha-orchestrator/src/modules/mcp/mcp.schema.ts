import { t } from "elysia";

/** A web channel whose pages announced WebMCP tools, with its newest catalog. */
const McpSite = t.Object({
	channelId: t.String(),
	channelSlug: t.String(),
	channelName: t.String(),
	tools: t.Array(
		t.Object({
			name: t.String(),
			description: t.Optional(t.String()),
			/** The JSON schema the page announced for the tool's arguments. */
			inputSchema: t.Optional(t.Unknown()),
		}),
	),
	toolCount: t.Number(),
	/** When this version of the catalog first / last arrived. */
	firstSeenAt: t.Number(),
	lastSeenAt: t.Number(),
	/** How many times this version was announced (panel openings). */
	registrations: t.Number(),
	/** Distinct catalog versions kept for the channel (at most 5). */
	versions: t.Number(),
});

export const McpSites = t.Object({ items: t.Array(McpSite) });
