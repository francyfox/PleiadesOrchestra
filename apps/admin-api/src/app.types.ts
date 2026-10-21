import type { ClientIpSource, Observability } from "@repo/elysia-kit";
import type { AdminDirectory } from "./modules/admins/admins.service.ts";
import type { Auth } from "./modules/auth/auth.ts";
import type { PolarClient } from "./modules/billing/billing.service.ts";
import type { AdminDb } from "./modules/database/database.ts";
import type { LiveTopic } from "./modules/live/live.types.ts";
import type { LiveHub } from "./modules/live-hub/live-hub.ts";
import type {
	LoginLimits,
	LoginThrottle,
} from "./modules/login-throttle/login-throttle.service.ts";
import type { Mailer } from "./modules/mail/mail.types.ts";
import type { OrchestratorClient } from "./modules/orchestrator/orchestrator.ts";
import type { SystemSnapshot } from "./modules/system/system.schema.ts";
import type { SystemFeed } from "./modules/system-feed/system-feed.ts";

export interface AdminApiDeps {
	observability: Observability;
	auth: Auth;
	db: AdminDb;
	orchestrator: OrchestratorClient;
	/** Sends the billing warning mails (the auth mails go through the same one). */
	mailer: Mailer;
	/** Polar REST client; unset = checkout and portal answer 503 `billing_unavailable`, deleting an account cancels nothing. */
	polar?: PolarClient;
	/** Origins the panel is served from; other origins can't make state-changing requests. */
	trustedOrigins: string[];
	/** Origin the panel is opened at; links in mails and redirects use it (default: the first trusted origin). */
	panelUrl?: string;
	systemSnapshot: () => Promise<SystemSnapshot>;
	/** Push interval of `/api/system/stream` (default 15000). */
	systemStreamIntervalMs?: number;
	/** Overrides of how often `/api/live` re-reads a topic (defaults in live-topics.ts); for tests. */
	liveIntervalsMs?: Partial<Record<LiveTopic, number>>;
	/** Where the client IP for login throttling and session records comes from (default: the socket). */
	clientIp?: { source: ClientIpSource; hops: number };
	/** Overrides of the login / registration limits (defaults in login-throttle.service.ts). */
	loginLimits?: Partial<LoginLimits>;
	now?: () => number;
	/** The panel's Sentry DSN: `/api/monitoring/tunnel` forwards only its envelopes (unset = tunnel off). */
	sentryTunnel?: {
		dsn: string;
		fetch?: (url: string, init: RequestInit) => Promise<Response>;
	};
}

/** `AdminApiDeps` with the defaults filled in — what the route plugins receive. */
export type RouteDeps = AdminApiDeps & {
	panelUrl: string;
	now: () => number;
	admins: AdminDirectory;
	systemFeed: SystemFeed;
	liveHub: LiveHub;
	clientIp: { source: ClientIpSource; hops: number };
	loginThrottle: LoginThrottle;
};
