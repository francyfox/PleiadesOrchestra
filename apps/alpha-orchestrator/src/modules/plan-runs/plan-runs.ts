import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { getRun } from "./plan-runs-admin.service.ts";

/** Admin route that shows one GOAP run. Auth is enforced by the app's `onRequest` guard. */
export function planRunsRoutes(db: Db) {
	return new Elysia({ prefix: "/v1/admin/runs" }).get(
		"/:id",
		({ params, status }) => {
			return getRun(db, params.id) ?? status(404, "Not found");
		},
	);
}
