import type { UserStatus } from "../access/access.types.ts";
import type { users } from "../database/database.schema.ts";
import type { UsageTotals } from "../usage/usage.types.ts";

export type UserRow = typeof users.$inferSelect;

export type ChannelKind = "telegram" | "cli" | "web";

export interface ChannelRef {
	id: string;
	slug: string;
	name: string;
	kind: ChannelKind;
}

export interface AdminUser {
	id: string;
	channel: ChannelRef;
	kind: "identified" | "anonymous";
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
	/** Client IP of the last widget request (plaintext, for admins); null if unknown. */
	ip: string | null;
	usage: UsageTotals;
}

export type UserAction = "whitelist" | "unwhitelist" | "block" | "unblock";

export interface ListUsersParams {
	channel?: string;
	kind?: "identified" | "anonymous";
	status?: UserStatus;
	q?: string;
	sort: "lastSeenAt" | "createdAt" | "tokens";
	order: "asc" | "desc";
	from: number;
	to: number;
	cursor?: string;
	limit: number;
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
