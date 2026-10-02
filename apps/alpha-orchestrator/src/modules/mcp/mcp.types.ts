export interface McpTool {
	name: string;
	description?: string;
	/** The JSON schema the page announced for the tool's arguments. */
	inputSchema?: unknown;
}

/** A web channel whose pages announced WebMCP tools, with its newest catalog. */
export interface McpSite {
	channelId: string;
	channelSlug: string;
	channelName: string;
	tools: McpTool[];
	toolCount: number;
	/** When this version of the catalog first / last arrived. */
	firstSeenAt: number;
	lastSeenAt: number;
	/** How many times this version was announced (panel openings). */
	registrations: number;
	/** Distinct catalog versions kept for the channel (at most 5). */
	versions: number;
}
