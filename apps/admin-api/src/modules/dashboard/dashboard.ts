import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ownerScope } from "../channels/channels.service.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { Dashboard } from "./dashboard.schema.ts";
import { fetchDashboard } from "./dashboard.service.ts";

export function dashboardRoutes({ auth, orchestrator, now }: RouteDeps) {
	return new Elysia({ name: "admin-api.dashboard", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ account: true }, (app) =>
			app.get(
				"/dashboard",
				({ query, account }) =>
					fetchDashboard(
						{ orchestrator, now },
						ownerScope(account) ?? query.ownerId,
					),
				{
					query: t.Object({ ownerId: t.Optional(t.String({ minLength: 1 })) }),
					response: { 200: Dashboard, ...Upstream },
					detail: {
						summary: "Dashboard numbers",
						description:
							"Stats plus 30 days of usage by day, top-10 visitors, channels and models, with spend when model prices are known. A user gets numbers of their own channels only; staff may narrow with `ownerId`.",
					},
				},
			),
		);
}
