import { Elysia } from "elysia";
import { type DocsOptions, docs } from "./docs.ts";
import type { ObservabilityEnv } from "./env.ts";
import { createLogger, type Logger } from "./logger.ts";
import { requestLog } from "./request-log.ts";
import { createMonitoring, type Monitoring } from "./sentry.ts";

export interface Observability {
	service: string;
	logger: Logger;
	monitoring: Monitoring;
}

/** The logger + error monitoring of one service, configured from its env. */
export function createObservability(
	service: string,
	env: ObservabilityEnv,
): Observability {
	return {
		service,
		logger: createLogger({ service, level: env.LOG_LEVEL }),
		monitoring: createMonitoring({
			service,
			dsn: env.SENTRY_DSN,
			environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
			release: env.SENTRY_RELEASE,
		}),
	};
}

export interface KitAppOptions {
	observability: Observability;
	/** Serve Swagger UI at `docs.path` (default `/swagger`). */
	docs?: DocsOptions;
}

/**
 * The Elysia app every service starts from: request logging, error
 * monitoring, `GET /health` and (optionally) Swagger. Add auth hooks and
 * routes on top; anything registered after this sees the shared plugins.
 */
export function createKitApp({
	observability,
	docs: docsOptions,
}: KitAppOptions) {
	const app = new Elysia()
		.use(requestLog({ logger: observability.logger }))
		.use(observability.monitoring.plugin);
	if (docsOptions) app.use(docs(docsOptions));
	return app.get("/health", () => "ok", { detail: { hide: true } });
}
