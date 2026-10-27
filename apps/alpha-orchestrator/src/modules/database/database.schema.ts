import { sql } from "drizzle-orm";
import {
	type AnySQLiteColumn,
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

// All timestamps are epoch ms stored as plain integers — the HTTP contract
// (apps/docs/content/en/drafts/admin-api.md) speaks epoch ms, so no Date round-trips.

export const channels = sqliteTable(
	"channels",
	{
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
		// admin-api account id of the owner (another database, so no FK); NULL = staff-owned.
		ownerId: text("owner_id"),
		// Ids of the intent sets that add dependencies and guards to the site's own tools
		// (`shop` = the built-in online-shop taxonomy). Empty = the tool itself is the goal.
		// Rows from before sets existed read `["shop"]`, so their behaviour does not change.
		intentSets: text("intent_sets", { mode: "json" })
			.$type<string[]>()
			.notNull()
			.default(["shop"]),
		// Split a message of several tasks with delta even without intent sets (for trying it out).
		severalTasks: integer("several_tasks", { mode: "boolean" })
			.notNull()
			.default(false),
	},
	(table) => [index("channels_owner_idx").on(table.ownerId)],
);

export const visitors = sqliteTable(
	"visitors",
	{
		id: text("id").primaryKey(),
		channelId: text("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		// NULL for anonymous visitors — SQLite treats NULLs as distinct in a
		// unique index, so any number of anonymous visitors per channel is fine.
		externalUserId: text("external_user_id"),
		kind: text("kind", { enum: ["identified", "anonymous"] }).notNull(),
		displayName: text("display_name"),
		// `adjective_animal_xxxxxx`; not unique. The "" default only lets the
		// migration add the column — rows get a name at insert or on startup backfill.
		name: text("name").notNull().default(""),
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
		uniqueIndex("visitors_channel_external_uq").on(
			table.channelId,
			table.externalUserId,
		),
		index("visitors_last_seen_idx").on(table.lastSeenAt),
		index("visitors_kind_last_seen_idx").on(table.kind, table.lastSeenAt),
	],
);

export const threads = sqliteTable(
	"threads",
	{
		id: text("id").primaryKey(),
		visitorId: text("visitor_id")
			.notNull()
			.references(() => visitors.id, { onDelete: "cascade" }),
		channelId: text("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		externalThreadId: text("external_thread_id"),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("threads_channel_visitor_external_uq").on(
			table.channelId,
			table.visitorId,
			table.externalThreadId,
		),
		index("threads_external_idx").on(table.externalThreadId),
	],
);

/** A flow line as the visitor saw it: the widget draws `phase` as … / ✓ / ✗ before `text`. */
export interface StoredStep {
	id: string;
	phase: "running" | "done" | "failed";
	text: string;
}

export const planRuns = sqliteTable(
	"plan_runs",
	{
		id: text("id").primaryKey(),
		visitorId: text("visitor_id")
			.notNull()
			.references(() => visitors.id, { onDelete: "cascade" }),
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
		// The flow lines the visitor saw while this run went (✓ Нашёл: …), one per
		// step id with its last phase — so a reloaded chat shows them again.
		steps: text("steps", { mode: "json" }).$type<StoredStep[]>(),
		// The server stopped while this run was executing: no trace was written and
		// nothing resumes it (`markInterruptedRuns`). The widget offers a retry.
		interrupted: integer("interrupted", { mode: "boolean" })
			.notNull()
			.default(false),
	},
	(table) => [
		index("plan_runs_visitor_idx").on(table.visitorId, table.createdAt),
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
		visitorId: text("visitor_id")
			.notNull()
			.references(() => visitors.id, { onDelete: "cascade" }),
		role: text("role", { enum: ["user", "assistant"] }).notNull(),
		content: text("content").notNull(),
		createdAt: integer("created_at").notNull(),
		planRunId: text("plan_run_id").references(
			(): AnySQLiteColumn => planRuns.id,
			{ onDelete: "set null" },
		),
	},
	(table) => [
		index("messages_visitor_idx").on(table.visitorId, table.id),
		index("messages_thread_idx").on(table.threadId, table.id),
	],
);

export const llmCalls = sqliteTable(
	"llm_calls",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		at: integer("at").notNull(),
		// Kept (with NULLed references) when visitors/threads/runs are deleted —
		// usage stats per channel/day must not change after cleanup.
		visitorId: text("visitor_id").references(() => visitors.id, {
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
		kind: text("kind", {
			enum: ["ingest", "generate", "decision", "translate", "classify"],
		}).notNull(),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		// NULL = provider didn't report usage. Never coerced to 0.
		inputTokens: integer("input_tokens"),
		outputTokens: integer("output_tokens"),
		latencyMs: integer("latency_ms").notNull(),
		ok: integer("ok", { mode: "boolean" }).notNull(),
		error: text("error"),
		// A decision's probability for its answer (classify: the intent's confidence); NULL for generation.
		confidence: real("confidence"),
	},
	(table) => [
		index("llm_calls_visitor_at_idx").on(table.visitorId, table.at),
		index("llm_calls_channel_at_idx").on(table.channelId, table.at),
		index("llm_calls_run_idx").on(table.planRunId),
		index("llm_calls_at_idx").on(table.at),
	],
);

export const visitorTokens = sqliteTable("visitor_tokens", {
	tokenHash: text("token_hash").primaryKey(),
	visitorId: text("visitor_id")
		.notNull()
		.references(() => visitors.id, { onDelete: "cascade" }),
	channelId: text("channel_id")
		.notNull()
		.references(() => channels.id, { onDelete: "cascade" }),
	createdAt: integer("created_at").notNull(),
	lastUsedAt: integer("last_used_at").notNull(),
	expiresAt: integer("expires_at").notNull(),
});

/**
 * GOAP `WorldState` a thread's plan run stopped short of its goal with —
 * WAITING-style resumption (`apps/docs/content/en/drafts/laya-autonomous-webmcp.md`): the next
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

/**
 * What a site's classifier has learned: an English message and the intent it
 * stands for. A row Laya produced is `pending` — kept for a person to judge,
 * never used to decide anything; only `approved` rows (approved or corrected
 * by an admin) feed the model. `rejected` rows stay so the same wrong guess
 * isn't offered again.
 */
export const intentExamples = sqliteTable(
	"intent_examples",
	{
		id: text("id").primaryKey(),
		channelId: text("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		// `normalizeIntentText` of the English text: the key of the example.
		textKey: text("text_key").notNull(),
		// The text as it came, for the admin to read.
		sample: text("sample").notNull(),
		intent: text("intent").notNull(),
		// Who produced the label: Laya, or an admin's correction.
		source: text("source", { enum: ["laya", "admin"] }).notNull(),
		status: text("status", {
			enum: ["pending", "approved", "rejected"],
		}).notNull(),
		// Who put it into the model: Laya's own confidence cleared the threshold
		// ("auto"), or a person approved/corrected it ("admin"); null while
		// pending/rejected, and on rows approved before this column existed.
		approvedBy: text("approved_by", { enum: ["auto", "admin"] }),
		// The probability of the label when Laya gave it (refitted, `withCalibration`).
		confidence: real("confidence"),
		// The run the label first came from, to open its graph.
		planRunId: text("plan_run_id").references(() => planRuns.id, {
			onDelete: "set null",
		}),
		seenCount: integer("seen_count").notNull().default(1),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("intent_examples_key_idx").on(table.channelId, table.textKey),
		index("intent_examples_status_idx").on(table.status, table.updatedAt),
	],
);

/**
 * What the visitor meets: the bot's name, tone and limits, one row per channel
 * (no row = the agent's built-in prompt). Only fills its own slots of the reply
 * prompt (`buildReplyPrompt`); the fixed rules are not stored here.
 */
export const channelPersona = sqliteTable("channel_persona", {
	channelId: text("channel_id")
		.primaryKey()
		.references(() => channels.id, { onDelete: "cascade" }),
	botName: text("bot_name").notNull().default(""),
	tone: text("tone").notNull().default(""),
	// Multi-line role text; every persona column is an override ("" = standard default).
	instructions: text("instructions").notNull().default(""),
	// ISO 639-1 code the bot answers in; "" = the visitor's own language.
	defaultLang: text("default_lang").notNull().default(""),
	greeting: text("greeting").notNull().default(""),
	forbiddenTopics: text("forbidden_topics", { mode: "json" })
		.$type<string[]>()
		.notNull()
		.default([]),
	handoffContact: text("handoff_contact").notNull().default(""),
	updatedAt: integer("updated_at").notNull(),
});

/** The model an admin picked for an agent from providers.toml; no row = the env server. */
export const agentSettings = sqliteTable("agent_settings", {
	agentId: text("agent_id").primaryKey(),
	/** A provider id from `providers.toml`; NULL or one no longer in the file = the env server. */
	provider: text("provider"),
	model: text("model"),
	updatedBy: text("updated_by").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

/** Polar subscriptions: each `subscription.*` webhook overwrites the row with the payload's fields. */
export const subscriptions = sqliteTable("subscriptions", {
	// Polar's subscription id.
	id: text("id").primaryKey(),
	customerId: text("customer_id").notNull(),
	customerEmail: text("customer_email"),
	productId: text("product_id"),
	productName: text("product_name"),
	// Polar's own status (active, past_due, canceled, ...).
	status: text("status").notNull(),
	startedAt: integer("started_at"),
	currentPeriodStart: integer("current_period_start"),
	currentPeriodEnd: integer("current_period_end"),
	cancelAtPeriodEnd: integer("cancel_at_period_end", {
		mode: "boolean",
	}).notNull(),
	endedAt: integer("ended_at"),
	// Polar's `modified_at`: an older event never overwrites a newer row.
	polarModifiedAt: integer("polar_modified_at"),
	// admin-api account id (Polar's `customer.external_id`); another database, so no FK.
	accountId: text("account_id").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

/** Polar orders (`order.paid` / `order.refunded`); amounts are integer cents. */
export const orders = sqliteTable("orders", {
	// Polar's order id.
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	productId: text("product_id"),
	kind: text("kind", { enum: ["plan", "credits"] }).notNull(),
	amount: integer("amount").notNull(),
	currency: text("currency").notNull(),
	status: text("status").notNull(),
	createdAt: integer("created_at").notNull(),
	refundedAmount: integer("refunded_amount").notNull().default(0),
});

/**
 * Append-only TR balance of an account (balance = SUM(amount)). `amount` is a
 * signed integer in micro-USD (1 TR = 1 USD = 1_000_000): a call of $0.00004
 * is 40, with no float drift in the sum. `ref` = order id (top_up, refund) or
 * `llm_calls.id` (usage). A top-up happens once per order (partial unique index).
 */
export const creditLedger = sqliteTable(
	"credit_ledger",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		accountId: text("account_id").notNull(),
		amount: integer("amount").notNull(),
		reason: text("reason", { enum: ["top_up", "usage", "refund"] }).notNull(),
		ref: text("ref").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		index("credit_ledger_account_idx").on(table.accountId),
		uniqueIndex("credit_ledger_top_up_once")
			.on(table.ref)
			.where(sql`${table.reason} = 'top_up'`),
	],
);

/** `webhook-id`s already handled: Polar redelivers, a replay must not run twice. */
export const billingWebhooks = sqliteTable("billing_webhooks", {
	id: text("id").primaryKey(),
	type: text("type").notNull(),
	receivedAt: integer("received_at").notNull(),
});

export const schema = {
	channels,
	channelPersona,
	visitors,
	threads,
	planRuns,
	planEvents,
	messages,
	llmCalls,
	visitorTokens,
	blockedIps,
	intentExamples,
	threadWorldState,
	agentSettings,
	subscriptions,
	orders,
	creditLedger,
	billingWebhooks,
};
