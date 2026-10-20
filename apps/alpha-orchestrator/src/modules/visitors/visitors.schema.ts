import { t } from "elysia";
import { ChannelRef } from "../channels/channels.schema.ts";
import { oneOf } from "../http/http.ts";

const USER_STATUSES = ["allowed", "pending", "blocked"] as const;

export const VisitorsQuery = t.Object({
	channel: t.Optional(t.String()),
	kind: t.Optional(oneOf(["identified", "anonymous"])),
	status: t.Optional(oneOf(USER_STATUSES)),
	q: t.Optional(t.String()),
	sort: t.Optional(oneOf(["lastSeenAt", "createdAt", "tokens"])),
	order: t.Optional(oneOf(["asc", "desc"])),
	from: t.Optional(t.Numeric()),
	to: t.Optional(t.Numeric()),
	cursor: t.Optional(t.String()),
	limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
});

export const BulkVisitorsBody = t.Object({
	ids: t.Array(t.String(), { maxItems: 1000 }),
	action: oneOf(["whitelist", "unwhitelist", "block", "unblock"]),
	reason: t.Optional(t.String()),
});

export const BlockVisitorBody = t.Optional(
	t.Object({ reason: t.Optional(t.String()) }),
);

/** Token totals over `llm_calls`; calls without reported usage are counted separately. */
export const UsageTotals = t.Object({
	inputTokens: t.Number(),
	outputTokens: t.Number(),
	calls: t.Number(),
	callsWithoutUsage: t.Number(),
});

export const AdminVisitor = t.Object({
	id: t.String(),
	channel: ChannelRef,
	kind: t.UnionEnum(["identified", "anonymous"]),
	externalUserId: t.Nullable(t.String()),
	displayName: t.Nullable(t.String()),
	/** Generated `adjective_animal_xxxxxx`; not unique, shown next to the id. */
	name: t.String(),
	status: t.UnionEnum(USER_STATUSES),
	whitelistedAt: t.Nullable(t.Number()),
	whitelistedBy: t.Nullable(t.String()),
	blockedAt: t.Nullable(t.Number()),
	blockedReason: t.Nullable(t.String()),
	blockedBy: t.Nullable(t.String()),
	createdAt: t.Number(),
	lastSeenAt: t.Number(),
	/** Client IP of the last widget request (plaintext, for admins); null if unknown. */
	ip: t.Nullable(t.String()),
	usage: UsageTotals,
});

export const VisitorsPage = t.Object({
	items: t.Array(AdminVisitor),
	/** Opaque; pass back as `cursor` for the next page. Null on the last page. */
	nextCursor: t.Nullable(t.String()),
	total: t.Number(),
});

export const BulkVisitorsResult = t.Object({
	/** How many visitors the action changed. */
	updated: t.Number(),
});

export const VisitorResult = t.Object({ visitor: AdminVisitor });

export const AdminMessage = t.Object({
	id: t.String(),
	threadId: t.String(),
	role: t.UnionEnum(["user", "assistant"]),
	content: t.String(),
	createdAt: t.Number(),
	planRunId: t.Nullable(t.String()),
	/** Sum over the run's model calls; token fields are null if any call reported none. Null for user messages. */
	usage: t.Nullable(
		t.Object({
			inputTokens: t.Nullable(t.Number()),
			outputTokens: t.Nullable(t.Number()),
			latencyMs: t.Number(),
		}),
	),
});

export const UsageByDay = t.Composite([
	UsageTotals,
	t.Object({ /** `YYYY-MM-DD`, UTC. */ day: t.String() }),
]);

export const UsageByModel = t.Composite([
	UsageTotals,
	t.Object({
		model: t.String(),
		kind: t.String(),
		avgLatencyMs: t.Number(),
	}),
]);

export const VisitorDetail = t.Object({
	visitor: AdminVisitor,
	/** The latest messages, oldest first. */
	messages: t.Array(AdminMessage),
	/** Last 30 days. */
	usageByDay: t.Array(UsageByDay),
	usageByModel: t.Array(UsageByModel),
});
