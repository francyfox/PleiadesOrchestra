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

export const VisitorStatus = t.UnionEnum(USER_STATUSES);

export const VisitorKind = t.UnionEnum(USER_KINDS);

export const BulkAction = t.UnionEnum([
	"whitelist",
	"unwhitelist",
	"block",
	"unblock",
]);

export const VisitorsSort = t.UnionEnum(USERS_SORTS);

export const SortOrder = t.UnionEnum(SORT_ORDERS);

export const Visitor = t.Object({
	id: t.String(),
	channel: ChannelRef,
	kind: VisitorKind,
	externalUserId: nullable(t.String()),
	displayName: nullable(t.String()),
	/** Generated `adjective_animal_xxxxxx`; not unique. */
	name: t.String(),
	status: VisitorStatus,
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

export const VisitorsQuery = t.Object({
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

export const VisitorsPage = t.Object({
	items: t.Array(Visitor),
	nextCursor: nullable(t.String()),
	total: t.Number(),
});

export const VisitorDetails = t.Object({
	visitor: Visitor,
	messages: t.Array(AdminMessage),
	usageByDay: t.Array(UsageByDay),
	usageByModel: t.Array(UsageByModel),
});

export type VisitorStatus = Static<typeof VisitorStatus>;
export type VisitorKind = Static<typeof VisitorKind>;
export type BulkAction = Static<typeof BulkAction>;
export type VisitorsSort = Static<typeof VisitorsSort>;
export type SortOrder = Static<typeof SortOrder>;
export type Visitor = Static<typeof Visitor>;
export type AdminMessage = Static<typeof AdminMessage>;
export type VisitorsQuery = Static<typeof VisitorsQuery>;
export type VisitorsPage = Static<typeof VisitorsPage>;
export type VisitorDetails = Static<typeof VisitorDetails>;
