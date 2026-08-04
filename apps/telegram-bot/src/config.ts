import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function buildConfig(env: Record<string, string | undefined>) {
	return createEnv({
		server: {
			NODE_ENV: z
				.enum(["production", "test", "development"])
				.default("development"),
			TELEGRAM_TOKEN: z.string().min(1),

			// Whitelist: only these Telegram user ids get responses.
			ALLOWED_TELEGRAM_USER_IDS: z
				.string()
				.min(1)
				.transform((value) => value.split(",").map(Number)),

			LLM_BASE_URL: z.url(),
			LLM_API_KEY: z.string().min(1),
			LLM_MODEL: z.string().default("vikhr-llama-3.2-1b"),

			// Webhook mode (replaces long-polling — avoids "Conflict: terminated by
			// other getUpdates request" during Railway rolling deploys).
			PORT: z.coerce.number().default(3000),
			TELEGRAM_WEBHOOK_URL: z.url(),
			TELEGRAM_WEBHOOK_SECRET: z.string().min(1),

			// VictoriaMetrics lives in a separate Railway project ("metrics"), so it's
			// only reachable over its public domain, not *.railway.internal.
			VICTORIA_METRICS_URL: z
				.url()
				.default("https://victoriametrics-production-7636.up.railway.app"),
			// Basic Auth credentials for the endpoint above — omit both to disable the push.
			VICTORIA_METRICS_USERNAME: z.string().optional(),
			VICTORIA_METRICS_PASSWORD: z.string().optional(),
		},
		runtimeEnv: env,
	});
}
