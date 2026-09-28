import {
	createKitApp,
	type Observability,
	onRequestGuard,
} from "@repo/elysia-kit";
import { Elysia } from "elysia";
import type { Auth } from "./auth.ts";
import type { AdminDb } from "./db/index.ts";
import { createLiveHub, type LiveHub } from "./live/hub.ts";
import type { LiveTopic } from "./live/protocol.ts";
import { createLiveTopics } from "./live/topics.ts";
import type { OrchestratorClient } from "./orchestrator/client.ts";
import { adminsRoutes } from "./routes/admins.ts";
import { liveRoutes } from "./routes/live.ts";
import { orchestratorRoutes } from "./routes/orchestrator.ts";
import { sessionRoutes } from "./routes/session.ts";
import { systemRoutes } from "./routes/system.ts";
import type { SystemSnapshot } from "./schemas/system.ts";
import { foreignOriginRejection } from "./security.ts";
import { createSystemFeed, type SystemFeed } from "./system/feed.ts";

export interface AdminApiDeps {
	observability: Observability;
	auth: Auth;
	db: AdminDb;
	orchestrator: OrchestratorClient;
	/** Origins the panel is served from; other origins can't make state-changing requests. */
	trustedOrigins: string[];
	systemSnapshot: () => Promise<SystemSnapshot>;
	/** Push interval of `/api/system/stream` (default 5000). */
	systemStreamIntervalMs?: number;
	/** Overrides of how often `/api/live` re-reads a topic (defaults in live/topics.ts); for tests. */
	liveIntervalsMs?: Partial<Record<LiveTopic, number>>;
	now?: () => number;
}

/** `AdminApiDeps` with the defaults filled in — what the route plugins receive. */
export type RouteDeps = AdminApiDeps & {
	now: () => number;
	systemFeed: SystemFeed;
	liveHub: LiveHub;
};

/**
 * Builds the Elysia app. Kept separate from index.ts so tests can call
 * `app.handle(request)` directly against an in-memory database and a fake
 * orchestrator. Everything is under `/api`; Swagger UI is at `/api/docs`.
 */
export function createApp(input: AdminApiDeps) {
	const now = input.now ?? Date.now;
	const deps: RouteDeps = {
		now,
		systemFeed: createSystemFeed({
			snapshot: input.systemSnapshot,
			intervalMs: input.systemStreamIntervalMs ?? 5000,
		}),
		liveHub: createLiveHub({
			topics: createLiveTopics(
				{ orchestrator: input.orchestrator, db: input.db, now },
				input.liveIntervalsMs,
			),
		}),
		...input,
	};

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
				.use(orchestratorRoutes(deps))
				.use(systemRoutes(deps))
				.use(liveRoutes(deps)),
		);
}

export type App = ReturnType<typeof createApp>;
