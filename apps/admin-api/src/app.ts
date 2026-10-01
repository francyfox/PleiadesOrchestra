import { createKitApp, onRequestGuard } from "@repo/elysia-kit";
import { Elysia } from "elysia";
import type { AdminApiDeps, RouteDeps } from "./app.types.ts";
import { createAdminDirectory } from "./modules/admins/admins.service.ts";
import { adminsRoutes } from "./modules/admins/admins.ts";
import { agentsRoutes } from "./modules/agents/agents.ts";
import { blockedIpsRoutes } from "./modules/blocked-ips/blocked-ips.ts";
import { channelsRoutes } from "./modules/channels/channels.ts";
import { dashboardRoutes } from "./modules/dashboard/dashboard.ts";
import { goapRoutes } from "./modules/goap/goap.ts";
import { liveRoutes } from "./modules/live/live.ts";
import { createLiveHub } from "./modules/live-hub/live-hub.ts";
import { createLiveTopics } from "./modules/live-topics/live-topics.ts";
import { foreignOriginRejection } from "./modules/origin-guard/origin-guard.service.ts";
import { performanceRoutes } from "./modules/performance/performance.ts";
import { planRunsRoutes } from "./modules/plan-runs/plan-runs.ts";
import { sessionRoutes } from "./modules/session/session.ts";
import { systemRoutes } from "./modules/system/system.ts";
import { createSystemFeed } from "./modules/system-feed/system-feed.ts";
import { usersRoutes } from "./modules/users/users.ts";

export type { AdminApiDeps, RouteDeps } from "./app.types.ts";

/** `AdminApiDeps` with the defaults filled in and the shared helpers created. */
function resolveDeps(input: AdminApiDeps): RouteDeps {
	const now = input.now ?? Date.now;
	const admins = createAdminDirectory(input.db);
	return {
		now,
		admins,
		systemFeed: createSystemFeed({
			snapshot: input.systemSnapshot,
			intervalMs: input.systemStreamIntervalMs ?? 5000,
		}),
		liveHub: createLiveHub({
			topics: createLiveTopics(
				{ orchestrator: input.orchestrator, db: input.db, now, admins },
				input.liveIntervalsMs,
			),
		}),
		...input,
	};
}

/**
 * Builds the Elysia app from its controllers. Kept apart from index.ts so
 * tests can call `app.handle(request)` against an in-memory database and a
 * fake orchestrator. Everything is under `/api`; Swagger UI is at `/api/docs`.
 */
export function createApp(input: AdminApiDeps) {
	const deps = resolveDeps(input);

	return createKitApp({
		observability: deps.observability,
		docs: {
			title: "admin-api",
			description:
				"Backend of the admin panel: admin accounts, and the orchestrator's admin API behind a session.",
			path: "/api/docs",
			security: "cookie",
		},
	})
		.onRequest(
			onRequestGuard(
				deps.observability.logger,
				foreignOriginRejection(deps.trustedOrigins),
			),
		)
		.use(
			new Elysia({ prefix: "/api" })
				.use(sessionRoutes(deps))
				.use(adminsRoutes(deps))
				.use(dashboardRoutes(deps))
				.use(performanceRoutes(deps))
				.use(planRunsRoutes(deps))
				.use(goapRoutes(deps))
				.use(usersRoutes(deps))
				.use(agentsRoutes(deps))
				.use(channelsRoutes(deps))
				.use(blockedIpsRoutes(deps))
				.use(systemRoutes(deps))
				.use(liveRoutes(deps)),
		);
}

export type App = ReturnType<typeof createApp>;
