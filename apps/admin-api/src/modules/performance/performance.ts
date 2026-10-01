import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { PerformanceReport } from "./performance.schema.ts";
import { fetchPerformance } from "./performance.service.ts";

export function performanceRoutes({ auth, orchestrator, now }: RouteDeps) {
	return new Elysia({ name: "admin-api.performance", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app.get(
				"/performance",
				({ query }) => fetchPerformance({ orchestrator, now }, query),
				{
					query: t.Object({ from: t.Optional(t.Numeric()) }),
					response: { 200: PerformanceReport, ...Upstream },
					detail: {
						summary: "Model-call latency percentiles (default: last 30 days)",
					},
				},
			),
		);
}
