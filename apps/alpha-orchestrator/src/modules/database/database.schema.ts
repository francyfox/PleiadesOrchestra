import {
	type AnySQLiteColumn,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

// All timestamps are epoch ms stored as plain integers — the HTTP contract
// (docs/admin-api.md) speaks epoch ms, so no Date round-trips.

export const channels = sqliteTable("channels", {
	id: text("id").primaryKey(),
	slug: text("slug").notNull().unique(),
	kind: text("kind", { enum: ["telegram", "cli", "web"] }).notNull(),
	name: text("name").notNull(),
	accessMode: text("access_mode", { enum: ["whitelist", "open"] }).notNull(),
	publishableKey: text("publishable_key").unique(),
	secretKeyHash: text("secret_key_hash"),
	allowedOrigins: text("allowed_origins", { mode: "json" })
		.$type<string[]>()
		.notNull()
		.default([]),
	disabledAt: integer("disabled_at"),
	createdAt: integer("created_at").notNull(),
	// Language the site's catalog is written in (ISO 639-1, `ru`, `en-GB`…): the
	// search query sent to the site's tools must be in it, whatever the shopper typed.
	catalogLanguage: text("catalog_language").notNull().default("en"),
});

export const users = sqliteTable(
	"users",
	{
		id: text("id").primaryKey(),
		channelId: text("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		// NULL for anonymous users — SQLite treats NULLs as distinct in a
		// unique index, so any number of anonymous users per channel is fine.
		externalUserId: text("external_user_id"),
		kind: text("kind", { enum: ["identified", "anonymous"] }).notNull(),
		displayName: text("display_name"),
		createdAt: integer("created_at").notNull(),
		lastSeenAt: integer("last_seen_at").notNull(),
		// Plaintext client IP of the last widget request, for the admin view /
		// whois. Blocking matches by salted hash (`blocked_ips.ip_hash`), not this.
		lastIp: text("last_ip"),
		whitelistedAt: integer("whitelisted_at"),
		// Admin ids come from better-auth in apps/admin — another database, so no FK.
		whitelistedBy: text("whitelisted_by"),
		blockedAt: integer("blocked_at"),
		blockedReason: text("blocked_reason"),
		blockedBy: text("blocked_by"),
	},
	(table) => [
		uniqueIndex("users_channel_external_uq").on(
			table.channelId,
			table.externalUserId,
		),
		index("users_last_seen_idx").on(table.lastSeenAt),
		index("users_kind_last_seen_idx").on(table.kind, table.lastSeenAt),
	],
);

export const threads = sqliteTable(
	"threads",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		channelId: text("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		externalThreadId: text("external_thread_id"),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("threads_channel_user_external_uq").on(
			table.channelId,
			table.userId,
			table.externalThreadId,
		),
		index("threads_external_idx").on(table.externalThreadId),
	],
);

export const planRuns = sqliteTable(
	"plan_runs",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		goal: text("goal", { mode: "json" })
			.$type<Record<string, unknown>>()
			.notNull(),
		succeeded: integer("succeeded", { mode: "boolean" }).notNull(),
		attempts: integer("attempts").notNull(),
		durationMs: integer("duration_ms").notNull(),
		createdAt: integer("created_at").notNull(),
		// One user message = a chain of runs (every browser tool result resumes
		// the request in a new run). The first run of the chain is its root;
		// `null` only on rows from before this column — read as the run itself.
		rootRunId: text("root_run_id"),
		// What the user wrote, set on the root run only (truncated).
		prompt: text("prompt"),
	},
	(table) => [
		index("plan_runs_user_idx").on(table.userId, table.createdAt),
		index("plan_runs_root_idx").on(table.rootRunId),
	],
);

/**
 * The WebMCP tool catalogs a web channel's pages have announced (the widget
 * posts its tools whenever its panel opens). One row per distinct catalog of a
 * channel (`hash` of the canonical tool list); opening the panel again with the
 * same tools only bumps `last_seen_at`/`registrations`.
 */
export const mcpCatalogs = sqliteTable(
	"mcp_catalogs",
	{
		channelId: text("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		hash: text("hash").notNull(),
		tools: text("tools", { mode: "json" })
			.$type<{ name: string; description?: string; inputSchema?: unknown }[]>()
			.notNull(),
		toolCount: integer("tool_count").notNull(),
		firstSeenAt: integer("first_seen_at").notNull(),
		lastSeenAt: integer("last_seen_at").notNull(),
		registrations: integer("registrations").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.channelId, table.hash] }),
		index("mcp_catalogs_seen_idx").on(table.channelId, table.lastSeenAt),
	],
);

export const planEvents = sqliteTable(
	"plan_events",
	{
		runId: text("run_id")
			.notNull()
			.references(() => planRuns.id, { onDelete: "cascade" }),
		seq: integer("seq").notNull(),
		type: text("type").notNull(),
		attempt: integer("attempt").notNull(),
		action: text("action"),
		payload: text("payload", { mode: "json" })
			.$type<Record<string, unknown>>()
			.notNull(),
		at: integer("at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.runId, table.seq] })],
);

export const messages = sqliteTable(
	"messages",
	{
		// Integer autoincrement, not uuid: a user+assistant pair is inserted in
		// the same millisecond, and retention/ordering need a strict order.
		id: integer("id").primaryKey({ autoIncrement: true }),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role", { enum: ["user", "assistant"] }).notNull(),
		content: text("content").notNull(),
		createdAt: integer("created_at").notNull(),
		planRunId: text("plan_run_id").references(
			(): AnySQLiteColumn => planRuns.id,
			{ onDelete: "set null" },
		),
	},
	(table) => [
		index("messages_user_idx").on(table.userId, table.id),
		index("messages_thread_idx").on(table.threadId, table.id),
	],
);

export const llmCalls = sqliteTable(
	"llm_calls",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		at: integer("at").notNull(),
		// Kept (with NULLed references) when users/threads/runs are deleted —
		// usage stats per channel/day must not change after cleanup.
		userId: text("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		channelId: text("channel_id").references(() => channels.id, {
			onDelete: "set null",
		}),
		threadId: text("thread_id").references(() => threads.id, {
			onDelete: "set null",
		}),
		planRunId: text("plan_run_id").references(() => planRuns.id, {
			onDelete: "set null",
		}),
		actionName: text("action_name"),
		kind: text("kind", { enum: ["ingest", "generate", "decision"] }).notNull(),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		// NULL = provider didn't report usage. Never coerced to 0.
		inputTokens: integer("input_tokens"),
		outputTokens: integer("output_tokens"),
		latencyMs: integer("latency_ms").notNull(),
		ok: integer("ok", { mode: "boolean" }).notNull(),
		error: text("error"),
	},
	(table) => [
		index("llm_calls_user_at_idx").on(table.userId, table.at),
		index("llm_calls_channel_at_idx").on(table.channelId, table.at),
		index("llm_calls_run_idx").on(table.planRunId),
		index("llm_calls_at_idx").on(table.at),
	],
);

export const visitorTokens = sqliteTable("visitor_tokens", {
	tokenHash: text("token_hash").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	channelId: text("channel_id")
		.notNull()
		.references(() => channels.id, { onDelete: "cascade" }),
	createdAt: integer("created_at").notNull(),
	lastUsedAt: integer("last_used_at").notNull(),
	expiresAt: integer("expires_at").notNull(),
});

/**
 * GOAP `WorldState` a thread's plan run stopped short of its goal with —
 * WAITING-style resumption (`docs/laya-autonomous-webmcp.md`): the next
 * `/v1/messages` on this thread loads it back instead of starting from a
 * blank state. Cleared once a run actually reaches its goal.
 */
export const threadWorldState = sqliteTable("thread_world_state", {
	threadId: text("thread_id")
		.primaryKey()
		.references(() => threads.id, { onDelete: "cascade" }),
	state: text("state", { mode: "json" })
		.$type<Record<string, boolean | number | string | undefined>>()
		.notNull(),
	/** The goal this checkpoint's run was pursuing — needed to resume a WAITING run (e.g. on a browser-side WebMCP tool call) with the exact same goal, not a re-derived one. */
	goal: text("goal", { mode: "json" })
		.$type<Record<string, boolean | number | string | undefined>>()
		.notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const blockedIps = sqliteTable(
	"blocked_ips",
	{
		id: text("id").primaryKey(),
		ipHash: text("ip_hash").notNull(),
		// Plaintext copy for the admin view; NULL on rows created before it existed.
		ip: text("ip"),
		channelId: text("channel_id").references(() => channels.id, {
			onDelete: "cascade",
		}),
		reason: text("reason").notNull(),
		createdAt: integer("created_at").notNull(),
		expiresAt: integer("expires_at").notNull(),
	},
	(table) => [index("blocked_ips_hash_idx").on(table.ipHash)],
);

export const schema = {
	channels,
	users,
	threads,
	planRuns,
	planEvents,
	messages,
	llmCalls,
	visitorTokens,
	blockedIps,
	threadWorldState,
};
