/**
 * DTOs of the orchestrator admin API — mirrors docs/admin-api.md, which is
 * the source of truth. Redeclared here (not imported from the orchestrator)
 * because sibling apps stay independent and only share the HTTP contract.
 */

export type UserStatus = "allowed" | "pending" | "blocked";
export type UserKind = "identified" | "anonymous";
export type ChannelKind = "telegram" | "cli" | "web";
export type AccessMode = "whitelist" | "open";

export interface ChannelRef {
	id: string;
	slug: string;
	name: string;
	kind: ChannelKind;
}

export interface UsageTotals {
	inputTokens: number;
	outputTokens: number;
	calls: number;
	callsWithoutUsage: number;
}

export interface AdminUser {
	id: string;
	channel: ChannelRef;
	kind: UserKind;
	externalUserId: string | null;
	displayName: string | null;
	status: UserStatus;
	whitelistedAt: number | null;
	whitelistedBy: string | null;
	blockedAt: number | null;
	blockedReason: string | null;
	blockedBy: string | null;
	createdAt: number;
	lastSeenAt: number;
	usage: UsageTotals;
}

export interface AdminMessage {
	id: string;
	threadId: string;
	role: "user" | "assistant";
	content: string;
	createdAt: number;
	planRunId: string | null;
	usage: {
		inputTokens: number | null;
		outputTokens: number | null;
		latencyMs: number;
	} | null;
}

export interface Channel extends ChannelRef {
	accessMode: AccessMode;
	allowedOrigins: string[];
	publishableKey: string | null;
	disabledAt: number | null;
	createdAt: number;
}

export type UsersSort = "lastSeenAt" | "createdAt" | "tokens";
export type SortOrder = "asc" | "desc";

export interface UsersQuery {
	channel?: string;
	kind?: UserKind;
	status?: UserStatus;
	q?: string;
	sort?: UsersSort;
	order?: SortOrder;
	from?: number;
	to?: number;
	cursor?: string;
	limit?: number;
}

export interface UsersPage {
	items: AdminUser[];
	nextCursor: string | null;
	total: number;
}

export interface UsageByDay extends UsageTotals {
	day: string;
}

export interface UsageByModel extends UsageTotals {
	model: string;
	kind: "ingest" | "generate" | "decision";
	avgLatencyMs: number;
}

export interface UserDetails {
	user: AdminUser;
	messages: AdminMessage[];
	usageByDay: UsageByDay[];
	usageByModel: UsageByModel[];
}

export type BulkAction = "whitelist" | "unwhitelist" | "block" | "unblock";

export type UsageGroupBy = "day" | "user" | "channel" | "model";

export interface UsageRow extends UsageTotals {
	key: string | null;
	label: string;
	avgLatencyMs: number;
}

export type CallKind = "ingest" | "generate" | "decision";

export interface LatencyStats {
	calls: number;
	failed: number;
	p50: number;
	p90: number;
	p99: number;
	max: number;
	/** Median output tokens/s; null when no call reported usage (Laya never does). */
	tokensPerSecond: number | null;
}

export interface PerformanceReport {
	rows: (LatencyStats & { day: string; kind: CallKind })[];
	overall: (LatencyStats & { kind: CallKind })[];
}

export interface Stats {
	users: { total: number; pending: number; blocked: number; anonymous: number };
	usage: { today: UsageTotals; last7d: UsageTotals; last30d: UsageTotals };
}

export type WorldState = Record<string, boolean | number | string | undefined>;

export type TraceEventType =
	| "planned"
	| "no_plan"
	| "action_skipped"
	| "action_started"
	| "action_finished"
	| "action_failed"
	| "replan"
	| "finished";

/** A stored `PlanTraceEvent` with `type`/`attempt`/`action`/`at` lifted to the top level. */
export interface TraceEvent {
	seq: number;
	type: TraceEventType;
	attempt: number;
	action: string | null;
	payload: Record<string, unknown>;
	at: number;
}

export interface PlanRun {
	id: string;
	userId: string;
	threadId: string;
	goal: WorldState;
	succeeded: boolean;
	attempts: number;
	durationMs: number;
	createdAt: number;
}

export interface RunLlmCall {
	actionName: string | null;
	kind: "ingest" | "generate" | "decision";
	model: string;
	inputTokens: number | null;
	outputTokens: number | null;
	latencyMs: number;
	ok: boolean;
	at: number;
}

export interface RunDetails {
	run: PlanRun;
	events: TraceEvent[];
	llmCalls: RunLlmCall[];
}

export interface GoapActionInfo {
	name: string;
	cost: number;
	preconditions: WorldState;
	effects: WorldState;
}

export interface BlockedIp {
	id: string;
	ipHash: string;
	channelId: string | null;
	reason: string;
	createdAt: number;
	expiresAt: number;
}

export interface CreateChannelInput {
	slug: string;
	name: string;
	kind: "web";
	accessMode: AccessMode;
	allowedOrigins: string[];
}

export interface UpdateChannelInput {
	name?: string;
	accessMode?: AccessMode;
	allowedOrigins?: string[];
	disabled?: boolean;
}

export interface CreateBlockedIpInput {
	ip: string;
	channelId?: string;
	reason: string;
	expiresInHours: number;
}
