import { type Static, t } from "elysia";
import { nullable, oneOf, WorldState } from "./common.ts";

const USER_STATUSES = ["allowed", "pending", "blocked"] as const;
const USER_KINDS = ["identified", "anonymous"] as const;
const USERS_SORTS = ["lastSeenAt", "createdAt", "tokens"] as const;
const SORT_ORDERS = ["asc", "desc"] as const;
const ACCESS_MODES = ["whitelist", "open"] as const;

/**
 * DTOs of the orchestrator's admin API — docs/admin-api.md is the source of
 * truth. They double as this service's response schemas: whatever the
 * orchestrator sends is checked against them before it reaches the panel.
 */

export const UserStatus = t.UnionEnum(USER_STATUSES);
export const UserKind = t.UnionEnum(USER_KINDS);
export const ChannelKind = t.UnionEnum(["telegram", "cli", "web"]);
export const AccessMode = t.UnionEnum(ACCESS_MODES);
export const CallKind = t.UnionEnum(["ingest", "generate", "decision"]);
export const BulkAction = t.UnionEnum([
	"whitelist",
	"unwhitelist",
	"block",
	"unblock",
]);
export const UsersSort = t.UnionEnum(USERS_SORTS);
export const SortOrder = t.UnionEnum(SORT_ORDERS);
export const UsageGroupBy = t.UnionEnum(["day", "user", "channel", "model"]);

export const ChannelRef = t.Object({
	id: t.String(),
	slug: t.String(),
	name: t.String(),
	kind: ChannelKind,
});

export const UsageTotals = t.Object({
	inputTokens: t.Number(),
	outputTokens: t.Number(),
	calls: t.Number(),
	callsWithoutUsage: t.Number(),
});

export const AdminUser = t.Object({
	id: t.String(),
	channel: ChannelRef,
	kind: UserKind,
	externalUserId: nullable(t.String()),
	displayName: nullable(t.String()),
	status: UserStatus,
	whitelistedAt: nullable(t.Number()),
	whitelistedBy: nullable(t.String()),
	blockedAt: nullable(t.Number()),
	blockedReason: nullable(t.String()),
	blockedBy: nullable(t.String()),
	createdAt: t.Number(),
	lastSeenAt: t.Number(),
	/** Client IP of the last widget request, plaintext for the admin view; null when unknown. */
	ip: nullable(t.String()),
	usage: UsageTotals,
});

export const AdminMessage = t.Object({
	id: t.String(),
	threadId: t.String(),
	role: t.UnionEnum(["user", "assistant"]),
	content: t.String(),
	createdAt: t.Number(),
	planRunId: nullable(t.String()),
	usage: nullable(
		t.Object({
			inputTokens: nullable(t.Number()),
			outputTokens: nullable(t.Number()),
			latencyMs: t.Number(),
		}),
	),
});

export const Channel = t.Composite([
	ChannelRef,
	t.Object({
		accessMode: AccessMode,
		allowedOrigins: t.Array(t.String()),
		publishableKey: nullable(t.String()),
		disabledAt: nullable(t.Number()),
		createdAt: t.Number(),
	}),
]);

export const UsersQuery = t.Object({
	channel: t.Optional(t.String()),
	// `oneOf`, not `UnionEnum`: inside Optional the latter fills in its first value.
	kind: t.Optional(oneOf(USER_KINDS)),
	status: t.Optional(oneOf(USER_STATUSES)),
	q: t.Optional(t.String()),
	sort: t.Optional(oneOf(USERS_SORTS)),
	order: t.Optional(oneOf(SORT_ORDERS)),
	from: t.Optional(t.Numeric()),
	to: t.Optional(t.Numeric()),
	cursor: t.Optional(t.String()),
	limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
});

export const UsersPage = t.Object({
	items: t.Array(AdminUser),
	nextCursor: nullable(t.String()),
	total: t.Number(),
});

export const UsageByDay = t.Composite([
	UsageTotals,
	t.Object({ day: t.String() }),
]);

export const UsageByModel = t.Composite([
	UsageTotals,
	t.Object({ model: t.String(), kind: CallKind, avgLatencyMs: t.Number() }),
]);

export const UserDetails = t.Object({
	user: AdminUser,
	messages: t.Array(AdminMessage),
	usageByDay: t.Array(UsageByDay),
	usageByModel: t.Array(UsageByModel),
});

export const UsageRow = t.Composite([
	UsageTotals,
	t.Object({
		key: nullable(t.String()),
		label: t.String(),
		avgLatencyMs: t.Number(),
	}),
]);

export const LatencyStats = t.Object({
	calls: t.Number(),
	failed: t.Number(),
	p50: t.Number(),
	p90: t.Number(),
	p99: t.Number(),
	max: t.Number(),
	/** Median output tokens/s; null when no call reported usage (Laya never does). */
	tokensPerSecond: nullable(t.Number()),
});

export const PerformanceReport = t.Object({
	rows: t.Array(
		t.Composite([LatencyStats, t.Object({ day: t.String(), kind: CallKind })]),
	),
	overall: t.Array(t.Composite([LatencyStats, t.Object({ kind: CallKind })])),
});

export const Stats = t.Object({
	users: t.Object({
		total: t.Number(),
		pending: t.Number(),
		blocked: t.Number(),
		anonymous: t.Number(),
	}),
	usage: t.Object({
		today: UsageTotals,
		last7d: UsageTotals,
		last30d: UsageTotals,
	}),
});

export const TraceEventType = t.UnionEnum([
	"planned",
	"no_plan",
	"action_skipped",
	"action_started",
	"action_finished",
	"action_failed",
	"replan",
	"finished",
]);

/** A stored `PlanTraceEvent` with `type`/`attempt`/`action`/`at` lifted to the top level. */
export const TraceEvent = t.Object({
	seq: t.Number(),
	type: TraceEventType,
	attempt: t.Number(),
	action: nullable(t.String()),
	payload: t.Record(t.String(), t.Unknown()),
	at: t.Number(),
});

export const PlanRun = t.Object({
	id: t.String(),
	userId: t.String(),
	threadId: t.String(),
	goal: WorldState,
	succeeded: t.Boolean(),
	attempts: t.Number(),
	durationMs: t.Number(),
	createdAt: t.Number(),
});

export const RunLlmCall = t.Object({
	actionName: nullable(t.String()),
	kind: CallKind,
	model: t.String(),
	inputTokens: nullable(t.Number()),
	outputTokens: nullable(t.Number()),
	latencyMs: t.Number(),
	ok: t.Boolean(),
	at: t.Number(),
});

export const RunDetails = t.Object({
	run: PlanRun,
	events: t.Array(TraceEvent),
	llmCalls: t.Array(RunLlmCall),
});

export const GoapActionInfo = t.Object({
	name: t.String(),
	cost: t.Number(),
	preconditions: WorldState,
	effects: WorldState,
});

/**
 * An action that only ever existed per-request — a WebMCP tool catalog a
 * visitor's browser sent with one of their messages — reconstructed from
 * that user's own plan-run history (`?userId=` on `/goap/actions`), not a
 * live catalog. No `preconditions`: no trace event carries an action's full
 * precondition set, so it isn't guessed. See docs/laya-autonomous-webmcp.md.
 */
export const DynamicActionInfo = t.Object({
	name: t.String(),
	cost: nullable(t.Number()),
	effects: WorldState,
	lastSeenAt: t.Number(),
});

export const BlockedIp = t.Object({
	id: t.String(),
	ipHash: t.String(),
	/** Plaintext for the admin view / whois; null on blocks created before it was stored. Matching is by `ipHash`. */
	ip: nullable(t.String()),
	channelId: nullable(t.String()),
	reason: t.String(),
	createdAt: t.Number(),
	expiresAt: t.Number(),
});

/** Optional offset paging; without `pageSize` the whole list comes back. */
export const PageQuery = t.Object({
	page: t.Optional(t.Numeric({ minimum: 1 })),
	pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
});

export const AgentRole = t.UnionEnum(["text", "decision"]);
export const AgentStatus = t.UnionEnum(["up", "down"]);

/** A model service the orchestrator talks to, with its last health probe. */
export const Agent = t.Object({
	id: t.String(),
	name: t.String(),
	role: AgentRole,
	/** Base URL without credentials. */
	endpoint: t.String(),
	model: nullable(t.String()),
	status: AgentStatus,
	latencyMs: nullable(t.Number()),
	checkedAt: t.Number(),
});

/** Wire input of `POST /channels` (before the handler's slug/name check). */
export const CreateChannelInput = t.Object({
	slug: t.String(),
	name: t.String(),
	accessMode: t.Optional(oneOf(ACCESS_MODES)),
	allowedOrigins: t.Optional(t.Array(t.String())),
});

export const UpdateChannelInput = t.Object({
	name: t.Optional(t.String()),
	accessMode: t.Optional(oneOf(ACCESS_MODES)),
	allowedOrigins: t.Optional(t.Array(t.String())),
	disabled: t.Optional(t.Boolean()),
});

export const CreateBlockedIpInput = t.Object({
	ip: t.String(),
	channelId: t.Optional(t.String()),
	reason: t.String(),
	expiresInHours: t.Number(),
});

export const ChannelWithSecret = t.Object({
	channel: Channel,
	secretKey: t.String(),
});

export type UserStatus = Static<typeof UserStatus>;
export type UserKind = Static<typeof UserKind>;
export type ChannelKind = Static<typeof ChannelKind>;
export type AccessMode = Static<typeof AccessMode>;
export type CallKind = Static<typeof CallKind>;
export type BulkAction = Static<typeof BulkAction>;
export type UsersSort = Static<typeof UsersSort>;
export type SortOrder = Static<typeof SortOrder>;
export type UsageGroupBy = Static<typeof UsageGroupBy>;
export type ChannelRef = Static<typeof ChannelRef>;
export type UsageTotals = Static<typeof UsageTotals>;
export type AdminUser = Static<typeof AdminUser>;
export type AdminMessage = Static<typeof AdminMessage>;
export type Channel = Static<typeof Channel>;
export type UsersQuery = Static<typeof UsersQuery>;
export type UsersPage = Static<typeof UsersPage>;
export type UsageByDay = Static<typeof UsageByDay>;
export type UsageByModel = Static<typeof UsageByModel>;
export type UserDetails = Static<typeof UserDetails>;
export type UsageRow = Static<typeof UsageRow>;
export type LatencyStats = Static<typeof LatencyStats>;
export type PerformanceReport = Static<typeof PerformanceReport>;
export type Stats = Static<typeof Stats>;
export type TraceEventType = Static<typeof TraceEventType>;
export type TraceEvent = Static<typeof TraceEvent>;
export type PlanRun = Static<typeof PlanRun>;
export type RunLlmCall = Static<typeof RunLlmCall>;
export type RunDetails = Static<typeof RunDetails>;
export type GoapActionInfo = Static<typeof GoapActionInfo>;
export type DynamicActionInfo = Static<typeof DynamicActionInfo>;
export type BlockedIp = Static<typeof BlockedIp>;
export type PageQuery = Static<typeof PageQuery>;
export type Agent = Static<typeof Agent>;
export type AgentRole = Static<typeof AgentRole>;
export type AgentStatus = Static<typeof AgentStatus>;
export type CreateChannelInput = Static<typeof CreateChannelInput>;
export type UpdateChannelInput = Static<typeof UpdateChannelInput>;
export type CreateBlockedIpInput = Static<typeof CreateBlockedIpInput>;
