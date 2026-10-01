import { observabilityEnv } from "@repo/elysia-kit";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Comma-separated list → trimmed, non-empty entries. */
const list = z.string().transform((value) =>
	value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean),
);

export function buildConfig(env: Record<string, string | undefined>) {
	return createEnv({
		server: {
			...observabilityEnv,

			NODE_ENV: z
				.enum(["production", "test", "development"])
				.default("development"),
			PORT: z.coerce.number().default(3003),

			// alpha-orchestrator — same variable name as apps/telegram-bot/apps/cli use.
			HARNESS_BASE_URL: z.url().default("http://localhost:3000"),
			// Separate from HARNESS_API_KEY: only /v1/admin/* accepts it.
			ADMIN_API_KEY: z.string().min(1),

			BETTER_AUTH_SECRET: z.string().min(32),
			// The URL the admin panel is opened at (the origin browsers see, i.e.
			// the one that proxies /api here).
			BETTER_AUTH_URL: z.url().default("http://localhost:3002"),
			// Origins allowed to make state-changing requests. `localhost` and
			// `127.0.0.1` are different origins to a browser, so both are listed.
			ADMIN_TRUSTED_ORIGINS: list.default([
				"http://localhost:3002",
				"http://127.0.0.1:3002",
			]),

			// How often /api/system/stream pushes a host snapshot to open panels.
			SYSTEM_STREAM_INTERVAL_MS: z.coerce.number().int().min(250).default(5000),

			// This service's own SQLite — admin accounts only, no chat data.
			ADMIN_DATABASE_PATH: z.string().min(1).default("./data/admin.db"),
			ADMIN_MIGRATIONS_DIR: z.string().min(1).default("./drizzle"),
		},
		runtimeEnv: env,
		// `SENTRY_DSN=` in a copied .env.example means "off", not an invalid URL.
		emptyStringAsUndefined: true,
	});
}

export type AdminApiConfig = ReturnType<typeof buildConfig>;
