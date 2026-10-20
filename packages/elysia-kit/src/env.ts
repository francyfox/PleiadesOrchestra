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
	/** Share of requests traced as spans; each span counts against the Sentry quota. */
	SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
};

export type ObservabilityEnv = {
	LOG_LEVEL: z.infer<typeof observabilityEnv.LOG_LEVEL>;
	SENTRY_DSN?: string;
	SENTRY_ENVIRONMENT?: string;
	SENTRY_RELEASE?: string;
	SENTRY_TRACES_SAMPLE_RATE?: number;
	NODE_ENV?: string;
};
