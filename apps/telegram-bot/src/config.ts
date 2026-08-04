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

			// Railway private-network hostname of the VictoriaMetrics service telemetry is pushed to.
			VICTORIA_METRICS_URL: z
				.url()
				.default("http://victoriametrics.railway.internal:8428"),
		},
		runtimeEnv: env,
	});
}
