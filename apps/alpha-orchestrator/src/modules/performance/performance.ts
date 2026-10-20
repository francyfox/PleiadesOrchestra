import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";
import { PerformanceQuery, PerformanceReport } from "./performance.schema.ts";
import { performance } from "./performance.service.ts";

export interface PerformanceDeps {
	db: Db;
	now: () => number;
}

/** Admin route: model-call latency percentiles. Auth is enforced by the app's `onRequest` guard. */
export function performanceRoutes({ db, now }: PerformanceDeps) {
	return new Elysia({
		prefix: "/v1/admin/performance",
		tags: ["Admin: usage & stats"],
	}).get(
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
			query: PerformanceQuery,
			response: { 200: PerformanceReport },
			detail: {
				summary: "Get model latency",
				description:
					"Latency percentiles (ms) of model calls per UTC day and call kind, and per kind overall. `from`/`to` are epoch ms and default to the last 30 days.",
			},
		},
	);
}
