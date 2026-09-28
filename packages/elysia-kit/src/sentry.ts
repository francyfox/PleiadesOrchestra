import { Elysia } from "elysia";
import { isServerFault } from "./errors.ts";

/** The slice of `@sentry/bun` the kit uses — injectable so tests never talk to Sentry. */
export interface SentryClient {
	captureException(
		error: unknown,
		hint?: { tags?: Record<string, string> },
	): void;
	flush(timeoutMs?: number): Promise<unknown>;
}

export interface MonitoringOptions {
	service: string;
	/** No DSN, no Sentry: the SDK isn't even loaded. */
	dsn?: string;
	environment?: string;
	release?: string;
	client?: SentryClient;
}

export interface Monitoring {
	enabled: boolean;
	/** Reports an error; a no-op without a DSN. Never throws. */
	capture(error: unknown, tags?: Record<string, string>): void;
	flush(timeoutMs?: number): Promise<void>;
	/** Elysia plugin: reports this service's own failures (5xx), not rejected requests. */
	plugin: Elysia;
}

/**
 * Error monitoring shared by every service. Sentry is opt-in through
 * `SENTRY_DSN`; without it `capture` does nothing, so dev and tests run
 * exactly as before.
 */
export function createMonitoring(options: MonitoringOptions): Monitoring {
	const enabled = Boolean(options.dsn || options.client);

	const ready: Promise<SentryClient> | null = options.client
		? Promise.resolve(options.client)
		: options.dsn
			? import("@sentry/bun").then((Sentry) => {
					Sentry.init({
						dsn: options.dsn,
						environment: options.environment,
						release: options.release,
						serverName: options.service,
						tracesSampleRate: 0,
						initialScope: { tags: { service: options.service } },
					});
					return Sentry as SentryClient;
				})
			: null;

	const capture = (error: unknown, tags?: Record<string, string>) => {
		ready
			?.then((client) => client.captureException(error, { tags }))
			.catch(() => {});
	};

	return {
		enabled,
		capture,
		flush: async (timeoutMs = 2000) => {
			await (await ready)?.flush(timeoutMs).catch(() => {});
		},
		plugin: new Elysia({ name: "kit.monitoring" }).onError(
			{ as: "global" },
			({ code, error, request }) => {
				if (!isServerFault(code, error)) return;
				capture(error, {
					"http.method": request.method,
					"url.path": new URL(request.url).pathname,
				});
			},
		),
	};
}
