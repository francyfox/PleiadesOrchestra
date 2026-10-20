import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { Stats } from "./stats.schema.ts";
import { stats } from "./stats.service.ts";

export interface StatsDeps {
	db: Db;
	now: () => number;
}

/** Admin route: visitor counts and token usage for the dashboard. */
export function statsRoutes({ db, now }: StatsDeps) {
	return new Elysia({
		prefix: "/v1/admin/stats",
		tags: ["Admin: usage & stats"],
	}).get("/", ({ query }) => stats(db, now(), query.ownerId), {
		query: t.Object({ ownerId: t.Optional(t.String({ minLength: 1 })) }),
		response: { 200: Stats },
		detail: {
			summary: "Get dashboard stats",
			description:
				"`ownerId` counts only the channels of that account (and their visitors and calls).",
		},
	});
}
