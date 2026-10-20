import * as Sentry from "@sentry/elysia";
import { type AnyElysia, Elysia } from "elysia";
import { isServerFault } from "./errors.ts";

/** The slice of `@sentry/elysia` the kit uses — injectable so tests never talk to Sentry. */
export interface SentryClient {
	captureException(
		error: unknown,
		hint?: { tags?: Record<string, string> },
	): void;
	flush(timeoutMs?: number): Promise<unknown>;
}

export interface MonitoringOptions {
	service: string;
	/** No DSN, no Sentry: the SDK is never initialised. */
	dsn?: string;
	environment?: string;
	release?: string;
	/** Share of requests traced as spans (0..1). */
	tracesSampleRate?: number;
	client?: SentryClient;
}

export interface Monitoring {
	enabled: boolean;
	/** Reports an error; a no-op without a DSN. Never throws. */
	capture(error: unknown, tags?: Record<string, string>): void;
	flush(timeoutMs?: number): Promise<void>;
	/** Request spans for the app (call first, before routes); returns `app` unchanged without a DSN. */
	instrument<T extends AnyElysia>(app: T): T;
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

	// Initialised here, synchronously, before any app exists: request spans need it.
	if (options.dsn && !options.client) {
		Sentry.init({
			dsn: options.dsn,
			environment: options.environment,
			release: options.release,
			serverName: options.service,
			// Health probes hit every few seconds; tracing them would eat the quota.
			tracesSampler: ({ attributes, inheritOrSampleWith }) =>
				attributes?.["url.path"] === "/health"
					? 0
					: inheritOrSampleWith(options.tracesSampleRate ?? 0),
			initialScope: { tags: { service: options.service } },
		});
	}
	const client: SentryClient | null =
		options.client ?? (options.dsn ? Sentry : null);

	const capture = (error: unknown, tags?: Record<string, string>) => {
		try {
			client?.captureException(error, { tags });
		} catch {}
	};

	return {
		enabled,
		capture,
		flush: async (timeoutMs = 2000) => {
			await client?.flush(timeoutMs).catch(() => {});
		},
		// Spans only: errors go through `plugin`, which knows which ones are server faults.
		instrument: (app) =>
			options.dsn && !options.client
				? Sentry.withElysia(app, { shouldHandleError: () => false })
				: app,
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
