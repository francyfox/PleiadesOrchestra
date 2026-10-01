import { type Static, t } from "elysia";
import { ChannelRef } from "../channels/channels.schema.ts";
import { nullable, oneOf } from "../common/common.schema.ts";
import {
	UsageByDay,
	UsageByModel,
	UsageTotals,
} from "../usage/usage.schema.ts";

const USER_STATUSES = ["allowed", "pending", "blocked"] as const;

const USER_KINDS = ["identified", "anonymous"] as const;

const USERS_SORTS = ["lastSeenAt", "createdAt", "tokens"] as const;

const SORT_ORDERS = ["asc", "desc"] as const;

export const UserStatus = t.UnionEnum(USER_STATUSES);

export const UserKind = t.UnionEnum(USER_KINDS);

export const BulkAction = t.UnionEnum([
	"whitelist",
	"unwhitelist",
	"block",
	"unblock",
]);

export const UsersSort = t.UnionEnum(USERS_SORTS);

export const SortOrder = t.UnionEnum(SORT_ORDERS);

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

export const UserDetails = t.Object({
	user: AdminUser,
	messages: t.Array(AdminMessage),
	usageByDay: t.Array(UsageByDay),
	usageByModel: t.Array(UsageByModel),
});

export type UserStatus = Static<typeof UserStatus>;
export type UserKind = Static<typeof UserKind>;
export type BulkAction = Static<typeof BulkAction>;
export type UsersSort = Static<typeof UsersSort>;
export type SortOrder = Static<typeof SortOrder>;
export type AdminUser = Static<typeof AdminUser>;
export type AdminMessage = Static<typeof AdminMessage>;
export type UsersQuery = Static<typeof UsersQuery>;
export type UsersPage = Static<typeof UsersPage>;
export type UserDetails = Static<typeof UserDetails>;
