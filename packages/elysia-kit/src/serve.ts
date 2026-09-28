import type { Observability } from "./app.ts";

interface ProcessLike {
	// biome-ignore lint/suspicious/noExplicitAny: matches NodeJS.Process.on
	on(event: string, listener: (...args: any[]) => unknown): unknown;
	exit(code?: number): unknown;
}

export interface LifecycleOptions {
	observability: Observability;
	/** Stop accepting requests. */
	stop: () => unknown;
	/** Release the service's own resources (DB handles, model sessions). */
	onShutdown?: () => unknown;
	process?: ProcessLike;
}

/**
 * Graceful shutdown on SIGINT/SIGTERM and last-resort error handlers.
 * Uncaught errors are reported and logged, not fatal — the same policy the
 * services had before, now identical everywhere.
 */
export function handleProcessLifecycle({
	observability: { logger, monitoring },
	stop,
	onShutdown,
	process: proc = process,
}: LifecycleOptions) {
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		proc.on(signal, async () => {
			logger.info({ message: "shutdown", signal });
			try {
				await stop();
				await onShutdown?.();
				await monitoring.flush();
			} catch (error) {
				logger.error({
					message: "shutdown_failed",
					"error.message": String(error),
				});
			}
			proc.exit(0);
		});
	}
	const fatal = (message: string) => (error: unknown) => {
		logger.error({
			message,
			"error.message": error instanceof Error ? error.message : String(error),
			"error.stack": error instanceof Error ? error.stack : undefined,
		});
		monitoring.capture(error, { source: message });
	};
	proc.on("uncaughtException", fatal("uncaught_exception"));
	proc.on("unhandledRejection", fatal("unhandled_rejection"));
}

/** `app.listen` + the lifecycle handlers, in one call for `index.ts`. */
export function serve(
	app: { listen(port: number): { stop(): unknown } },
	options: {
		port: number;
		observability: Observability;
		onShutdown?: () => unknown;
	},
) {
	const listening = app.listen(options.port);
	handleProcessLifecycle({
		observability: options.observability,
		stop: () => listening.stop(),
		onShutdown: options.onShutdown,
	});
	options.observability.logger.info({
		message: "listening",
		port: options.port,
	});
	return listening;
}
