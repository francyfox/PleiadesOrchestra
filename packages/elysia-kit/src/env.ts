import { z } from "zod";

/**
 * Env fields every service accepts — spread into each app's
 * `createEnv({ server: { ...observabilityEnv, ... } })`.
 */
export const observabilityEnv = {
	LOG_LEVEL: z
		.enum(["silent", "error", "warn", "info", "debug"])
		.default("info"),
	/** Unset = error monitoring off. */
	SENTRY_DSN: z.url().optional(),
	SENTRY_ENVIRONMENT: z.string().min(1).optional(),
	SENTRY_RELEASE: z.string().min(1).optional(),
};

export type ObservabilityEnv = {
	LOG_LEVEL: z.infer<typeof observabilityEnv.LOG_LEVEL>;
	SENTRY_DSN?: string;
	SENTRY_ENVIRONMENT?: string;
	SENTRY_RELEASE?: string;
	NODE_ENV?: string;
};
