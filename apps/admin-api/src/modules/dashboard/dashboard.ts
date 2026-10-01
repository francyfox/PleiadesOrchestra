import { Elysia } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { Dashboard } from "./dashboard.schema.ts";
import { fetchDashboard } from "./dashboard.service.ts";

export function dashboardRoutes({ auth, orchestrator, now }: RouteDeps) {
	return new Elysia({ name: "admin-api.dashboard", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app.get("/dashboard", () => fetchDashboard({ orchestrator, now }), {
				response: { 200: Dashboard, ...Upstream },
				detail: {
					summary: "Dashboard numbers",
					description:
						"Stats plus 30 days of usage by day, top-10 users and channels.",
				},
			}),
		);
}
