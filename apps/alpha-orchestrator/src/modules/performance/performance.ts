import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";
import { performance } from "./performance.service.ts";

export interface PerformanceDeps {
	db: Db;
	now: () => number;
}

/** Admin route: model-call latency percentiles. Auth is enforced by the app's `onRequest` guard. */
export function performanceRoutes({ db, now }: PerformanceDeps) {
	return new Elysia({ prefix: "/v1/admin/performance" }).get(
		"/",
		({ query }) => {
			const current = now();
			return performance(
				db,
				query.from ?? current - 30 * DAY_MS,
				query.to ?? current,
			);
		},
		{
			query: t.Object({
				from: t.Optional(t.Numeric()),
				to: t.Optional(t.Numeric()),
			}),
		},
	);
}
