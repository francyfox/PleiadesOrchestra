import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function buildConfig(env: Record<string, string | undefined>) {
	return createEnv({
		server: {
			NODE_ENV: z
				.enum(["production", "test", "development"])
				.default("development"),
			TELEGRAM_TOKEN: z.string().min(1),

			// harness owns the LLM call — this transport only forwards to it.
			HARNESS_BASE_URL: z.url(),
			HARNESS_API_KEY: z.string().min(1),

			// Webhook mode (replaces long-polling — avoids "Conflict: terminated by
			// other getUpdates request" whenever the process restarts/redeploys).
			PORT: z.coerce.number().default(3000),
			TELEGRAM_WEBHOOK_URL: z.url(),
			TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
		},
		runtimeEnv: env,
	});
}
