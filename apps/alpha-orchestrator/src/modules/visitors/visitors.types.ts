import type { VisitorStatus } from "../access/access.types.ts";
import type { visitors } from "../database/database.schema.ts";
import type { UsageTotals } from "../usage/usage.types.ts";

export type VisitorRow = typeof visitors.$inferSelect;

export type ChannelKind = "telegram" | "cli" | "web";

export interface ChannelRef {
	id: string;
	slug: string;
	name: string;
	kind: ChannelKind;
}

export interface AdminVisitor {
	id: string;
	channel: ChannelRef;
	kind: "identified" | "anonymous";
	externalUserId: string | null;
	displayName: string | null;
	/** Generated `adjective_animal_xxxxxx`; not unique. */
	name: string;
	status: VisitorStatus;
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

export type VisitorAction = "whitelist" | "unwhitelist" | "block" | "unblock";

export interface ListVisitorsParams {
	channel?: string;
	/** Only visitors of this account's channels. */
	ownerId?: string;
	kind?: "identified" | "anonymous";
	status?: VisitorStatus;
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
