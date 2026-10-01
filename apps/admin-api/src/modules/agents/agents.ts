import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { Agent } from "./agents.schema.ts";

export function agentsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.agents", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app.get("/agents", async () => orchestrator.listAgents(), {
				response: { 200: t.Object({ items: t.Array(Agent) }), ...Upstream },
				detail: {
					summary: "Model services with their health",
					description:
						"The orchestrator's text (LLM) and decision (Laya) agents, each probed at request time.",
				},
			}),
		);
}
