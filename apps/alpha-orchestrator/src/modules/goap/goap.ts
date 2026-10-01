import type { GoapAction } from "@repo/core";
import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { dynamicActionsForUser } from "../plan-runs/plan-runs-admin.service.ts";

export interface GoapDeps {
	db: Db;
	/** The static catalog served by `/goap/actions` (without `execute`). */
	actions: GoapAction[];
}

/** Admin route: the GOAP action catalog, plus the per-thread actions a user's runs have used. */
export function goapRoutes({ db, actions }: GoapDeps) {
	return new Elysia({ prefix: "/v1/admin/goap" }).get(
		"/actions",
		({ query }) => {
			const catalog = actions.map(({ name, cost, preconditions, effects }) => ({
				name,
				cost,
				preconditions,
				effects,
			}));
			if (!query.userId) return { actions: catalog };
			const staticNames = new Set(catalog.map((action) => action.name));
			return {
				actions: catalog,
				dynamicActions: dynamicActionsForUser(db, query.userId, staticNames),
			};
		},
		{ query: t.Object({ userId: t.Optional(t.String()) }) },
	);
}
