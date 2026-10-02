import { Elysia, t } from "elysia";
import type { ActiveRuns } from "../active-runs/active-runs.ts";
import type { Db } from "../database/database.ts";
import { PageQuery } from "../http/http.ts";
import { getRequest, listRequests } from "./requests.service.ts";

export interface RequestsDeps {
	db: Db;
	activeRuns: ActiveRuns;
	now: () => number;
}

/**
 * Admin routes for GOAP requests: one row per user message (a chain of runs),
 * and the whole chain of one request — prompt, plan steps, timings, answer.
 * Auth is enforced by the app's `onRequest` guard.
 */
export function requestsRoutes({ db, activeRuns, now }: RequestsDeps) {
	return new Elysia({ prefix: "/v1/admin/requests" })
		.get("/", ({ query }) => listRequests(db, activeRuns, query, now()), {
			query: PageQuery,
		})
		.get(
			"/:id",
			({ params, status }) =>
				getRequest(db, activeRuns, params.id, now()) ??
				status(404, "Not found"),
			{ params: t.Object({ id: t.String() }) },
		);
}
