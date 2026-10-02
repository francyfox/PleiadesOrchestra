import { Elysia } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { McpSites } from "./mcp.schema.ts";
import { fetchMcpSites } from "./mcp.service.ts";

export function mcpRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.mcp", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app.get("/mcp", () => fetchMcpSites({ orchestrator }), {
				response: { 200: McpSites, ...Upstream },
				detail: {
					summary: "WebMCP tool catalogs announced by the channels' pages",
					description:
						"Filled by `POST /v1/widget/tools` (panel opened); the newest version per channel.",
				},
			}),
		);
}
