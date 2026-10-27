import { CLIENT_IP_SOURCES, observabilityEnv } from "@repo/elysia-kit";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function buildConfig(env: Record<string, string | undefined>) {
	return createEnv({
		server: {
			...observabilityEnv,

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
			// Model name in the request body; an external Laya server may name it differently.
			LAYA_MODEL: z.string().default("laya"),

			// delta-function-call — writes the JSON arguments of WebMCP tool calls
			// (see apps/delta-function-call). Optional: without a base URL the
			// arguments are built mechanically from the facts of the run.
			FUNCTION_CALL_BASE_URL: z.url().optional(),
			FUNCTION_CALL_API_KEY: z.string().default(""),
			// llama-server serves one model and ignores the name (it is for the usage
			// ledger); Ollama needs the real tag, e.g. `qwen3:1.7b-q8_0`.
			FUNCTION_CALL_MODEL: z.string().default("qwen3-1.7b"),

			// Conservative default for a small self-hosted context window (CTX_SIZE
			// on `albedo` defaults to 2048 tokens) — long messages get split on word
			// boundaries into chunks of at most this many characters instead of
			// overflowing the model's context in one shot.
			HARNESS_MAX_CHUNK_CHARS: z.coerce.number().default(1200),

			// SQLite file (visitors, history, usage, GOAP traces). Its directory is
			// created on startup; in compose it lives on the `alpha-orchestrator-data` volume.
			DATABASE_PATH: z.string().min(1).default("./data/orchestrator.db"),
			// Where the drizzle SQL migrations are read from at startup. Unset =
			// the repo's apps/alpha-orchestrator/drizzle (fine for `bun src/index.ts`);
			// the compiled Docker binary can't see the repo, so the image sets it.
			DATABASE_MIGRATIONS_DIR: z.string().min(1).optional(),

			// Separate secret for /v1/admin/* (used by apps/admin-api only) —
			// a leaked transport key must not be able to read every chat.
			ADMIN_API_KEY: z.string().min(1),

			// Providers, models and their parameters (Crush-like TOML with keys,
			// edited in the admin panel). Created from the env servers when missing.
			PROVIDERS_CONFIG_PATH: z
				.string()
				.min(1)
				.default("./configs/providers.toml"),

			// Signing secret of the Polar webhook endpoint (`whsec_...` or Polar's
			// plain secret). Unset = POST /v1/billing/polar does not exist.
			POLAR_WEBHOOK_SECRET: z.string().min(1).optional(),
			// Where a subscription is shown in Polar, without the id:
			// https://polar.sh/dashboard/<org-slug>/sales/subscriptions (check the path in
			// your dashboard). Unset = no link in the admin panel.
			POLAR_DASHBOARD_URL: z.url().optional(),
			// Polar product ids: the credits (TR) pack vs the monthly plan. An order of
			// the credits product tops the balance up (1 TR = 1 USD). With a plan id set,
			// events of other products are ignored; without, any other product is a plan.
			POLAR_CREDITS_PRODUCT_ID: z.string().min(1).optional(),
			POLAR_PLAN_PRODUCT_ID: z.string().min(1).optional(),

			// Comma-separated origins allowed to call /v1/admin/requests/* from a
			// browser (CORS). The token is still required on every actual request —
			// CORS only lets the browser send the cross-origin fetch at all.
			// Example: https://shalotts.site,http://localhost:5173
			ADMIN_CORS_ORIGINS: z.string().default("https://shalotts.site"),

			// Messages kept per visitor, across all their threads. Must be ≥ the
			// agent's history window (checked at startup).
			MESSAGE_RETENTION_PER_USER: z.coerce
				.number()
				.int()
				.positive()
				.default(10),

			// Salt for hashing IPs: blocks match by hash. The plaintext IP is kept
			// separately (visitors.last_ip, blocked_ips.ip) for the admin view only.
			IP_HASH_SALT: z.string().min(1),

			// Anonymous chat visitors inactive longer than this are deleted.
			ANON_RETENTION_HOURS: z.coerce.number().positive().default(24),

			// A thread's persisted GOAP WorldState (see SqliteWorldStateStore) not
			// updated for this long is deleted — covers stuck/abandoned plan runs
			// belonging to *identified* visitors, who aren't cleared by
			// ANON_RETENTION_HOURS. Same default: no reason for it to outlive an
			// anonymous visitor's own retention window.
			WORLD_STATE_RETENTION_HOURS: z.coerce.number().positive().default(24),

			// Web chat widget (/v1/widget/*) abuse limits — public, anonymous
			// access to a CPU-only model. In-memory, reset on restart.
			WIDGET_MAX_TEXT_CHARS: z.coerce.number().int().positive().default(2000),
			// POST /v1/widget/tools, registered once per panel-open (not per
			// message) — a real WebMCP catalog (a dozen-plus tools with real
			// descriptions/schemas) is several kB on its own, well past
			// WIDGET_MAX_TEXT_CHARS.
			WIDGET_MAX_WEBMCP_TOOLS_CHARS: z.coerce
				.number()
				.int()
				.positive()
				.default(20_000),
			// Request body caps (bytes). HTTP_MAX_BODY_BYTES is Bun's
			// `maxRequestBodySize` for the whole server (default of Bun: 128 MB);
			// WIDGET_MAX_BODY_BYTES is the stricter check on public /v1/widget/*
			// by Content-Length, before the body is read.
			HTTP_MAX_BODY_BYTES: z.coerce
				.number()
				.int()
				.positive()
				.default(1_048_576),
			WIDGET_MAX_BODY_BYTES: z.coerce
				.number()
				.int()
				.positive()
				.default(131_072),
			// Threads one visitor token may create per hour (POST /v1/widget/threads).
			WIDGET_THREADS_PER_HOUR: z.coerce.number().int().positive().default(30),
			// Threads whose classified WebMCP catalog stays in memory (LRU; entries
			// also expire after ANON_RETENTION_HOURS).
			WIDGET_MAX_CATALOG_THREADS: z.coerce
				.number()
				.int()
				.positive()
				.default(1000),
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
			WIDGET_TOOL_RESULTS_PER_MINUTE: z.coerce
				.number()
				.int()
				.positive()
				.default(120),
			WIDGET_VISITORS_PER_HOUR_PER_IP: z.coerce
				.number()
				.int()
				.positive()
				.default(20),
			// Where the client IP (per-IP widget limits, IP blocks) comes from —
			// see resolveClientIp. `socket` is the only source a client can't
			// forge without a proxy in front; compose (Cloudflare tunnel) sets
			// cf-connecting-ip.
			CLIENT_IP_SOURCE: z.enum(CLIENT_IP_SOURCES).default("socket"),
			// xff-rightmost only: trusted proxies appending to X-Forwarded-For;
			// the client IP is this many entries from the right.
			TRUSTED_PROXY_HOPS: z.coerce.number().int().positive().default(1),

			// Concurrent calls per model server. Match each server's parallel slots
			// (local llama-server PARALLEL, Ollama OLLAMA_NUM_PARALLEL, the Laya
			// server's threads): more clients than that just queue at the server
			// instead of here, where the wait is at least bounded and visible.
			// Conservative defaults for the local CPU-bound sidecars.
			LLM_MAX_CONCURRENCY: z.coerce.number().int().positive().default(4),
			// The local delta-function-call runs with PARALLEL=1 (see its Dockerfile).
			FUNCTION_CALL_MAX_CONCURRENCY: z.coerce
				.number()
				.int()
				.positive()
				.default(1),
			LAYA_MAX_CONCURRENCY: z.coerce.number().int().positive().default(4),
			// Laya's intent answers with calibrated confidence from here up are
			// approved on their own (the site's memory learns them); below, a
			// person judges them in /intents. 0.85: the Laya authors' suggested start.
			LAYA_AUTO_APPROVE_CONFIDENCE: z.coerce
				.number()
				.min(0)
				.max(1)
				.default(0.85),
		},
		runtimeEnv: env,
		// `SENTRY_DSN=` in a copied .env.example means "off", not an invalid URL.
		emptyStringAsUndefined: true,
	});
}
