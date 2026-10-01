import { Elysia } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { IdParams, Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { RunDetails } from "./plan-runs.schema.ts";

export function planRunsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.plan-runs", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app.get("/runs/:id", ({ params }) => orchestrator.getRun(params.id), {
				params: IdParams,
				response: { 200: RunDetails, ...Upstream },
				detail: { summary: "One GOAP plan run with its trace" },
			}),
		);
}
