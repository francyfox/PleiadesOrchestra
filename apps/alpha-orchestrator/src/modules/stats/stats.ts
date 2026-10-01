import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { stats } from "./stats.service.ts";

export interface StatsDeps {
	db: Db;
	now: () => number;
}

/** Admin route: user counts and token usage for the dashboard. */
export function statsRoutes({ db, now }: StatsDeps) {
	return new Elysia({ prefix: "/v1/admin/stats" }).get("/", () =>
		stats(db, now()),
	);
}
