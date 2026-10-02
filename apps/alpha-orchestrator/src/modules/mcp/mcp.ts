import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { listMcpSites } from "./mcp.service.ts";

/** Admin route: the WebMCP tool catalogs the channels' pages announced. Auth is the app's `onRequest` guard. */
export function mcpRoutes(db: Db) {
	return new Elysia({ prefix: "/v1/admin/mcp" }).get("/", () => ({
		items: listMcpSites(db),
	}));
}
