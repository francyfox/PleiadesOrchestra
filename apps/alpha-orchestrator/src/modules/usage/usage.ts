import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";
import { oneOf } from "../http/http.ts";
import { usageRows } from "./usage.service.ts";

export interface UsageDeps {
	db: Db;
	now: () => number;
}

/** Admin route: token usage grouped by day, user, channel or model. */
export function usageRoutes({ db, now }: UsageDeps) {
	return new Elysia({ prefix: "/v1/admin/usage" }).get(
		"/",
		({ query }) => {
			const current = now();
			return {
				rows: usageRows(
					db,
					query.groupBy,
					query.from ?? current - 30 * DAY_MS,
					query.to ?? current,
					query.channel,
				),
			};
		},
		{
			query: t.Object({
				groupBy: oneOf(["day", "user", "channel", "model"]),
				from: t.Optional(t.Numeric()),
				to: t.Optional(t.Numeric()),
				channel: t.Optional(t.String()),
			}),
		},
	);
}
