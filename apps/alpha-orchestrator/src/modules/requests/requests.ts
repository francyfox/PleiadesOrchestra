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
}

/**
 * Admin routes for GOAP requests: one row per user message (a chain of runs),
 * and the whole chain of one request — prompt, plan steps, timings, answer.
 * Auth is enforced by the app's `onRequest` guard.
 */
export function requestsRoutes({ db, activeRuns, now }: RequestsDeps) {
	return new Elysia({ prefix: "/v1/admin/requests" })
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
