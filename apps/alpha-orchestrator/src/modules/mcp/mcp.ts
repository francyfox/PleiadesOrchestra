import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { McpSites } from "./mcp.schema.ts";
import { listMcpSites } from "./mcp.service.ts";

/** Admin route: the WebMCP tool catalogs the channels' pages announced. Auth is the app's `onRequest` guard. */
export function mcpRoutes(db: Db) {
	return new Elysia({
		prefix: "/v1/admin/mcp",
		tags: ["Admin: MCP"],
	}).get("/", () => ({ items: listMcpSites(db) }), {
		response: { 200: McpSites },
		detail: {
			summary: "List announced WebMCP tools",
			description:
				"One entry per channel that announced tools: its newest catalog, newest-seen channel first.",
		},
	});
}
