import { Elysia, t } from "elysia";
import type { ActiveRuns } from "../active-runs/active-runs.ts";
import type { Db } from "../database/database.ts";
import { oneOf, PageQuery } from "../http/http.ts";
import { getRequest, listRequests } from "./requests.service.ts";

/** Paging plus optional filters (`oneOf`, not `t.UnionEnum`: an omitted field must stay undefined). */
const RequestsQuery = t.Composite([
	PageQuery,
	t.Object({
		status: t.Optional(
			oneOf(["running", "waiting", "succeeded", "failed", "abandoned"]),
		),
		intent: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
	}),
]);

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
		"vary": "Origin",
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
		.onAfterHandle(({ request, set }: { request: Request; set: { headers: Record<string, string | number | undefined> } }) => {
			const origin = request.headers.get("origin") ?? "";
			if (!origins.has(origin)) return;
			set.headers["access-control-allow-origin"] = origin;
			set.headers["vary"] = "Origin";
		});
}

export function requestsRoutes({ db, activeRuns, now, corsOrigins }: RequestsDeps) {
	return new Elysia({ prefix: "/v1/admin/requests" })
		.use(adminCors(corsOrigins))
		.get("/", ({ query }) => listRequests(db, activeRuns, query, now()), {
			query: RequestsQuery,
		})
		.get(
			"/:id",
			({ params, status }) =>
				getRequest(db, activeRuns, params.id, now()) ??
				status(404, "Not found"),
			{ params: t.Object({ id: t.String() }) },
		);
}
