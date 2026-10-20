import { Elysia, t } from "elysia";
import type { ActiveRuns } from "../active-runs/active-runs.ts";
import type { Db } from "../database/database.ts";
import {
	RequestDetails,
	RequestParams,
	RequestsPage,
	RequestsQuery,
} from "./requests.schema.ts";
import { getRequest, listRequests } from "./requests.service.ts";

export interface RequestsDeps {
	db: Db;
	activeRuns: ActiveRuns;
	now: () => number;
	/** Origins allowed to call these routes from a browser (CORS). */
	corsOrigins: Set<string>;
}

/**
 * Admin routes for GOAP requests: one row per user message (a chain of runs),
 * and the whole chain of one request — prompt, plan steps, timings, answer.
 * Auth is enforced by the app's `onRequest` guard.
 */
function adminCors(origins: Set<string>) {
	const allow = (origin: string) => ({
		"access-control-allow-origin": origin,
		vary: "Origin",
	});
	return new Elysia()
		.options("/*", ({ request }) => {
			const origin = request.headers.get("origin") ?? "";
			if (!origins.has(origin)) return new Response(null, { status: 403 });
			return new Response(null, {
				status: 204,
				headers: {
					...allow(origin),
					"access-control-allow-methods": "GET, OPTIONS",
					"access-control-allow-headers": "authorization, content-type",
					"access-control-max-age": "600",
				},
			});
		})
		.onAfterHandle(
			({
				request,
				set,
			}: {
				request: Request;
				set: { headers: Record<string, string | number | undefined> };
			}) => {
				const origin = request.headers.get("origin") ?? "";
				if (!origins.has(origin)) return;
				set.headers["access-control-allow-origin"] = origin;
				set.headers["vary"] = "Origin";
			},
		);
}

export function requestsRoutes({
	db,
	activeRuns,
	now,
	corsOrigins,
}: RequestsDeps) {
	return new Elysia({
		prefix: "/v1/admin/requests",
		tags: ["Admin: requests"],
	})
		.use(adminCors(corsOrigins))
		.get("/", ({ query }) => listRequests(db, activeRuns, query, now()), {
			query: RequestsQuery,
			response: { 200: RequestsPage },
			detail: {
				summary: "List requests",
				description:
					"One row per user message (a chain of runs), newest first. `page`/`pageSize` page the list (25 per page by default); `status` and `intent` filter it. Callable from allowed admin origins (CORS).",
			},
		})
		.get(
			"/:id",
			({ params, status }) =>
				getRequest(db, activeRuns, params.id, now()) ??
				status(404, "Not found"),
			{
				params: RequestParams,
				response: { 200: RequestDetails, 404: t.String() },
				detail: {
					summary: "Get a request",
					description:
						"The whole chain of one request: runs with trace events, model calls, goal and reply. `id` may be any run of the chain. 404 when the run is unknown.",
				},
			},
		);
}
