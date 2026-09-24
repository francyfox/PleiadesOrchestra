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

			// gamma-decision — typed-decision sidecar (see apps/gamma-decision), reached
			// the same way as beta-text: its own base URL + shared bearer secret.
			LAYA_API_BASE_URL: z.url(),
			LAYA_API_KEY: z.string().min(1),

			// Conservative default for a small self-hosted context window (CTX_SIZE
			// on `albedo` defaults to 2048 tokens) — long messages get split on word
			// boundaries into chunks of at most this many characters instead of
			// overflowing the model's context in one shot.
			HARNESS_MAX_CHUNK_CHARS: z.coerce.number().default(1200),

			// SQLite file (users, history, usage, GOAP traces). Its directory is
			// created on startup; in compose it lives on the `alpha-orchestrator-data` volume.
			DATABASE_PATH: z.string().min(1).default("./data/orchestrator.db"),
			// Where the drizzle SQL migrations are read from at startup. Unset =
			// the repo's apps/alpha-orchestrator/drizzle (fine for `bun src/index.ts`);
			// the compiled Docker binary can't see the repo, so the image sets it.
			DATABASE_MIGRATIONS_DIR: z.string().min(1).optional(),

			// Separate secret for /v1/admin/* (used by apps/admin's server side only) —
			// a leaked transport key must not be able to read every chat.
			ADMIN_API_KEY: z.string().min(1),

			// Messages kept per user, across all their threads. Must be ≥ the
			// agent's history window (checked at startup).
			MESSAGE_RETENTION_PER_USER: z.coerce
				.number()
				.int()
				.positive()
				.default(10),

			// Salt for hashing IPs (blocked-ips); the raw IP is never stored.
			IP_HASH_SALT: z.string().min(1),

			// Anonymous chat users inactive longer than this are deleted.
			ANON_RETENTION_HOURS: z.coerce.number().positive().default(24),

			// Shop chat widget (/v1/widget/*) abuse limits — public, anonymous
			// access to a CPU-only model. In-memory, reset on restart.
			WIDGET_MAX_TEXT_CHARS: z.coerce.number().int().positive().default(2000),
			WIDGET_MESSAGES_PER_MINUTE: z.coerce
				.number()
				.int()
				.positive()
				.default(10),
			WIDGET_IP_MESSAGES_PER_MINUTE: z.coerce
				.number()
				.int()
				.positive()
				.default(30),
			WIDGET_VISITORS_PER_HOUR_PER_IP: z.coerce
				.number()
				.int()
				.positive()
				.default(20),
			// Take the client IP from X-Forwarded-For. Only behind a proxy/tunnel
			// you control — otherwise any client can spoof its IP past blocks and limits.
			TRUST_PROXY: z.stringbool().default(false),
		},
		runtimeEnv: env,
	});
}
