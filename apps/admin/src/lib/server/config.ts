import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function buildConfig(
	env: Record<string, string | undefined>,
	options: { skipValidation?: boolean } = {},
) {
	return createEnv({
		server: {
			// alpha-orchestrator — same variable name as apps/telegram-bot/apps/cli use.
			HARNESS_BASE_URL: z.url().default("http://localhost:3000"),
			// Separate from HARNESS_API_KEY: only /v1/admin/* accepts it.
			ADMIN_API_KEY: z.string().min(1),

			BETTER_AUTH_SECRET: z.string().min(32),
			BETTER_AUTH_URL: z.url().default("http://localhost:3002"),

			// The admin app's own SQLite — admin accounts only, no chat data.
			ADMIN_DATABASE_PATH: z.string().min(1).default("./data/admin.db"),
			ADMIN_MIGRATIONS_DIR: z.string().min(1).default("./drizzle"),
		},
		runtimeEnv: env,
		skipValidation: options.skipValidation,
	});
}

export type AdminConfig = ReturnType<typeof buildConfig>;
