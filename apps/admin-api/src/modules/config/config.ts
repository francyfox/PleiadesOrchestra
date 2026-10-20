import { CLIENT_IP_SOURCES, observabilityEnv } from "@repo/elysia-kit";
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
			// Origin the links in mails and redirects point at; defaults to BETTER_AUTH_URL.
			PUBLIC_PANEL_URL: z.url().optional(),
			// Mail for customer accounts (verification, password reset). Without
			// SMTP_PASS nothing is sent: the subject and link are logged instead.
			SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
			SMTP_PORT: z.coerce.number().int().positive().default(465),
			SMTP_USER: z.string().optional(),
			SMTP_PASS: z.string().optional(),
			SMTP_FROM: z.string().min(1).default("info@shalotts.site"),
			// The admin panel's own Sentry DSN (VITE_SENTRY_DSN there): /api/monitoring/tunnel
			// forwards only its envelopes. Unset = no tunnel.
			SENTRY_TUNNEL_DSN: z.url().optional(),
			// Origins allowed to make state-changing requests. `localhost` and
			// `127.0.0.1` are different origins to a browser, so both are listed.
			ADMIN_TRUSTED_ORIGINS: list.default([
				"http://localhost:3002",
				"http://127.0.0.1:3002",
			]),

			// Where the client IP (login throttling, session records) comes from.
			// admin-api is normally reached directly, so the socket address.
			// `cf-connecting-ip` / `xff-rightmost` only behind a proxy you control.
			CLIENT_IP_SOURCE: z.enum(CLIENT_IP_SOURCES).default("socket"),
			// `xff-rightmost` only: trusted proxies appending to X-Forwarded-For.
			TRUSTED_PROXY_HOPS: z.coerce.number().int().positive().default(1),

			// Login brute-force limits: failures per account / per IP within the
			// window; reaching either locks it for the rest of the window.
			LOGIN_MAX_FAILURES_PER_ACCOUNT: z.coerce
				.number()
				.int()
				.positive()
				.default(5),
			LOGIN_MAX_FAILURES_PER_IP: z.coerce.number().int().positive().default(20),
			LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

			// How often /api/system/stream pushes a host snapshot to open panels.
			SYSTEM_STREAM_INTERVAL_MS: z.coerce
				.number()
				.int()
				.min(250)
				.default(15000),

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
