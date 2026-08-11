import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function buildConfig(env: Record<string, string | undefined>) {
	return createEnv({
		server: {
			NODE_ENV: z
				.enum(["production", "test", "development"])
				.default("development"),

			PORT: z.coerce.number().default(3000),

			// Shared secret transport adapters (telegram-bot, future Discord adapter, ...)
			// send as `Authorization: Bearer <key>` to reach this service.
			HARNESS_API_KEY: z.string().min(1),

			LLM_BASE_URL: z.url(),
			LLM_API_KEY: z.string().min(1),
			LLM_MODEL: z.string().default("vikhr-llama-3.2-1b"),

			// Conservative default for a small self-hosted context window (CTX_SIZE
			// on `albedo` defaults to 2048 tokens) — long messages get split on word
			// boundaries into chunks of at most this many characters instead of
			// overflowing the model's context in one shot.
			HARNESS_MAX_CHUNK_CHARS: z.coerce.number().default(1200),

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
