import type { Observability } from "@repo/elysia-kit";
import type { AdminDirectory } from "./modules/admins/admins.service.ts";
import type { Auth } from "./modules/auth/auth.ts";
import type { AdminDb } from "./modules/database/database.ts";
import type { LiveTopic } from "./modules/live/live.types.ts";
import type { LiveHub } from "./modules/live-hub/live-hub.ts";
import type { OrchestratorClient } from "./modules/orchestrator/orchestrator.ts";
import type { SystemSnapshot } from "./modules/system/system.schema.ts";
import type { SystemFeed } from "./modules/system-feed/system-feed.ts";

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
	/** Overrides of how often `/api/live` re-reads a topic (defaults in live-topics.ts); for tests. */
	liveIntervalsMs?: Partial<Record<LiveTopic, number>>;
	now?: () => number;
}

/** `AdminApiDeps` with the defaults filled in — what the route plugins receive. */
export type RouteDeps = AdminApiDeps & {
	now: () => number;
	admins: AdminDirectory;
	systemFeed: SystemFeed;
	liveHub: LiveHub;
};
