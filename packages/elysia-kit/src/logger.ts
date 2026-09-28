import {
	type ConsolaInstance,
	type ConsolaReporter,
	createConsola,
	type InputLogObject,
	LogLevels,
	type LogObject,
} from "consola";

export type LogLevelName = "silent" | "error" | "warn" | "info" | "debug";

const LEVELS: Record<LogLevelName, number> = {
	silent: LogLevels.silent,
	error: LogLevels.error,
	warn: LogLevels.warn,
	info: LogLevels.info,
	debug: LogLevels.debug,
};

/** One flat JSON object per line, to stdout — what every service logs in production. */
export function jsonReporter(
	write: (line: string) => void = (line) => process.stdout.write(line),
): ConsolaReporter {
	return {
		log(logObj: LogObject) {
			const { type: _type, tag: _tag, args, date, level, ...fields } = logObj;
			// consola moves an object call's `message` into `args[0]`.
			const message = typeof args[0] === "string" ? args[0] : undefined;
			write(
				`${JSON.stringify({ time: date.toISOString(), level, message, ...fields })}\n`,
			);
		},
	};
}

export interface LoggerOptions {
	/** Goes into every line as `service.name` (OpenTelemetry resource attribute). */
	service: string;
	level?: LogLevelName;
	reporters?: ConsolaReporter[];
}

/**
 * The shared structured logger. Call with a fields object
 * (`logger.info({ message: "event", "some.field": 1 })`) — never pass request
 * or chat bodies in; the HTTP plugin only ever logs method, path, status, timing.
 */
export function createLogger(options: LoggerOptions): ConsolaInstance {
	return createConsola({
		// Explicit: consola lowers its default level under NODE_ENV=test, which
		// silently drops info lines — logging must not depend on the environment.
		level: LEVELS[options.level ?? "info"],
		reporters: options.reporters ?? [jsonReporter()],
		defaults: { "service.name": options.service } as InputLogObject,
	});
}

export type Logger = ConsolaInstance;
