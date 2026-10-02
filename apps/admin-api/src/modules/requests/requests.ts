import { Elysia } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { PageQuery } from "../common/common.schema.ts";
import { IdParams, Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { RequestsPage, RequestView } from "./requests.schema.ts";
import { fetchRequests, fetchRequestView } from "./requests.service.ts";

export function requestsRoutes({ auth, orchestrator, now }: RouteDeps) {
	const ctx = { orchestrator, now };
	return new Elysia({ name: "admin-api.requests", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/requests", ({ query }) => fetchRequests(ctx, query), {
					query: PageQuery,
					response: { 200: RequestsPage, ...Upstream },
					detail: {
						summary: "GOAP requests, newest first (one per user message)",
					},
				})
				.get(
					"/requests/:id",
					({ params }) => fetchRequestView(ctx, params.id),
					{
						params: IdParams,
						response: { 200: RequestView, ...Upstream },
						detail: {
							summary: "One request: prompt, plan steps with timings, result",
							description:
								"Any run id of the request opens it. Running steps carry elapsed time relative to `now`.",
						},
					},
				),
		);
}
