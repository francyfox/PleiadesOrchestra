import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { IdParams, Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { RequestsPage, RequestsQuery, RequestView } from "./requests.schema.ts";
import {
	fetchRequests,
	fetchRequestTrace,
	fetchRequestView,
} from "./requests.service.ts";

export function requestsRoutes({ auth, orchestrator, now }: RouteDeps) {
	const ctx = { orchestrator, now };
	return new Elysia({ name: "admin-api.requests", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/requests", ({ query }) => fetchRequests(ctx, query), {
					query: RequestsQuery,
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
				)
				.get(
					"/requests/:id/trace",
					({ params }) => fetchRequestTrace(ctx, params.id),
					{
						params: IdParams,
						// loose on purpose: Elysia drops fields a schema does not list
						response: { 200: t.Array(t.Unknown()), ...Upstream },
						detail: {
							summary: "The request as a Model Context Tool Inspector trace",
							description:
								"Prompt, browser tool calls and their answers, reply; the site's tools declared on every turn.",
						},
					},
				),
		);
}
