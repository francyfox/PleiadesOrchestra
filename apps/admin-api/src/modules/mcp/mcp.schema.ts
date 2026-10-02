import { type Static, t } from "elysia";
import { nullable } from "../common/common.schema.ts";

/** What the orchestrator stores per tool: the page's own descriptor. */
export const UpstreamMcpTool = t.Object({
	name: t.String(),
	description: t.Optional(t.String()),
	inputSchema: t.Optional(t.Unknown()),
});

const SiteFields = {
	channelId: t.String(),
	channelSlug: t.String(),
	channelName: t.String(),
	toolCount: t.Number(),
	firstSeenAt: t.Number(),
	lastSeenAt: t.Number(),
	registrations: t.Number(),
	versions: t.Number(),
};

export const UpstreamMcpSites = t.Object({
	items: t.Array(t.Object({ ...SiteFields, tools: t.Array(UpstreamMcpTool) })),
});

/** One argument of a function, read out of its JSON schema. */
export const McpParam = t.Object({
	name: t.String(),
	/** `string`, `number`, `string[]`, … */
	type: nullable(t.String()),
	description: nullable(t.String()),
	required: t.Boolean(),
	/** The allowed values of an enum. */
	values: nullable(t.Array(t.String())),
});

export const McpTool = t.Object({
	name: t.String(),
	description: nullable(t.String()),
	params: t.Array(McpParam),
});

export const McpSite = t.Object({ ...SiteFields, tools: t.Array(McpTool) });

export const McpSites = t.Object({ items: t.Array(McpSite) });

export type UpstreamMcpSites = Static<typeof UpstreamMcpSites>;
export type McpParam = Static<typeof McpParam>;
export type McpTool = Static<typeof McpTool>;
export type McpSite = Static<typeof McpSite>;
export type McpSites = Static<typeof McpSites>;
