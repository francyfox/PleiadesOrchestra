import { Elysia, t } from "elysia";
import type { RouteDeps } from "../app.ts";
import { orchestratorErrors, requireAdmin } from "../plugins.ts";
import { ApiError } from "../schemas/errors.ts";
import {
	AdminUser,
	Agent,
	BlockedIp,
	BulkAction,
	Channel,
	ChannelWithSecret,
	CreateBlockedIpInput,
	CreateChannelInput,
	GoapActionInfo,
	PageQuery,
	PerformanceReport,
	RunDetails,
	Stats,
	UpdateChannelInput,
	UsageRow,
	UserDetails,
	UsersPage,
	UsersQuery,
} from "../schemas/orchestrator.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const SLUG = /^[a-z0-9-]+$/;

const Params = t.Object({ id: t.String() });
const Upstream = {
	401: ApiError,
	404: ApiError,
	502: ApiError,
	503: ApiError,
} as const;

const Dashboard = t.Object({
	stats: Stats,
	byDay: t.Array(
		t.Object({
			day: t.String(),
			inputTokens: t.Number(),
			outputTokens: t.Number(),
		}),
	),
	topUsers: t.Array(UsageRow),
	byChannel: t.Array(UsageRow),
});

const byTokens = (
	a: { inputTokens: number; outputTokens: number },
	b: typeof a,
) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);

/**
 * The orchestrator's `/v1/admin/*` API, exposed to the panel behind an admin
 * session. Reads use the shared admin key; every mutation also carries the
 * signed-in admin's id (`X-Admin-Id`) for the audit fields.
 */
export function orchestratorRoutes({ auth, orchestrator, now }: RouteDeps) {
	return new Elysia({ name: "admin-api.orchestrator", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get(
					"/dashboard",
					async () => {
						const from = now() - 30 * DAY_MS;
						const [stats, byDay, byUser, byChannel] = await Promise.all([
							orchestrator.stats(),
							orchestrator.usage({ groupBy: "day", from }),
							orchestrator.usage({ groupBy: "user", from }),
							orchestrator.usage({ groupBy: "channel", from }),
						]);
						return {
							stats,
							byDay: byDay.rows.map((row) => ({
								day: row.label,
								inputTokens: row.inputTokens,
								outputTokens: row.outputTokens,
							})),
							topUsers: [...byUser.rows].sort(byTokens).slice(0, 10),
							byChannel: [...byChannel.rows].sort(byTokens),
						};
					},
					{
						response: { 200: Dashboard, ...Upstream },
						detail: {
							summary: "Dashboard numbers",
							description:
								"Stats plus 30 days of usage by day, top-10 users and channels.",
						},
					},
				)
				.get(
					"/performance",
					({ query }) =>
						orchestrator.performance({
							from: query.from ?? now() - 30 * DAY_MS,
						}),
					{
						query: t.Object({ from: t.Optional(t.Numeric()) }),
						response: { 200: PerformanceReport, ...Upstream },
						detail: {
							summary: "Model-call latency percentiles (default: last 30 days)",
						},
					},
				)
				.get("/runs/:id", ({ params }) => orchestrator.getRun(params.id), {
					params: Params,
					response: { 200: RunDetails, ...Upstream },
					detail: { summary: "One GOAP plan run with its trace" },
				})
				.get("/goap/actions", () => orchestrator.goapActions(), {
					response: {
						200: t.Object({ actions: t.Array(GoapActionInfo) }),
						...Upstream,
					},
					detail: { summary: "The GOAP action catalog" },
				})

				// --- chat users -------------------------------------------------
				.get("/users", ({ query }) => orchestrator.listUsers(query), {
					query: UsersQuery,
					response: { 200: UsersPage, ...Upstream },
					detail: { summary: "List chat users (cursor-paginated)" },
				})
				.post(
					"/users/bulk",
					async ({ body, admin, status }) => {
						if (body.ids.length === 0)
							return status(400, { error: "no_selection" });
						return orchestrator
							.as(admin.id)
							.bulkUsers(
								body.ids,
								body.action,
								body.reason?.trim() || undefined,
							);
					},
					{
						body: t.Object({
							ids: t.Array(t.String(), { maxItems: 1000 }),
							action: BulkAction,
							reason: t.Optional(t.String()),
						}),
						response: {
							200: t.Object({ updated: t.Number() }),
							400: ApiError,
							...Upstream,
						},
						detail: { summary: "Apply one action to many users" },
					},
				)
				.get("/users/:id", ({ params }) => orchestrator.getUser(params.id), {
					params: Params,
					response: { 200: UserDetails, ...Upstream },
					detail: { summary: "A user with messages and usage" },
				})
				.post(
					"/users/:id/whitelist",
					({ params, admin }) =>
						orchestrator.as(admin.id).whitelistUser(params.id),
					{
						params: Params,
						response: { 200: t.Object({ user: AdminUser }), ...Upstream },
						detail: { summary: "Allow a user" },
					},
				)
				.post(
					"/users/:id/unwhitelist",
					({ params, admin }) =>
						orchestrator.as(admin.id).unwhitelistUser(params.id),
					{
						params: Params,
						response: { 200: t.Object({ user: AdminUser }), ...Upstream },
						detail: { summary: "Remove a user from the whitelist" },
					},
				)
				.post(
					"/users/:id/block",
					({ params, body, admin }) =>
						orchestrator
							.as(admin.id)
							.blockUser(params.id, body?.reason?.trim() || undefined),
					{
						params: Params,
						body: t.Optional(t.Object({ reason: t.Optional(t.String()) })),
						response: { 200: t.Object({ user: AdminUser }), ...Upstream },
						detail: { summary: "Block a user" },
					},
				)
				.post(
					"/users/:id/unblock",
					({ params, admin }) =>
						orchestrator.as(admin.id).unblockUser(params.id),
					{
						params: Params,
						response: { 200: t.Object({ user: AdminUser }), ...Upstream },
						detail: { summary: "Unblock a user" },
					},
				)
				.delete(
					"/users/:id/messages",
					async ({ params, admin, set }) => {
						await orchestrator.as(admin.id).deleteUserMessages(params.id);
						set.status = 204;
					},
					{
						params: Params,
						detail: { summary: "Delete a user's stored messages" },
					},
				)

				.get("/agents", async () => orchestrator.listAgents(), {
					response: { 200: t.Object({ items: t.Array(Agent) }), ...Upstream },
					detail: {
						summary: "Model services with their health",
						description:
							"The orchestrator's text (LLM) and decision (Laya) agents, each probed at request time.",
					},
				})

				// --- channels ---------------------------------------------------
				.get("/channels", ({ query }) => orchestrator.listChannels(query), {
					query: PageQuery,
					response: {
						200: t.Object({ items: t.Array(Channel), total: t.Number() }),
						...Upstream,
					},
					detail: {
						summary: "List channels",
						description:
							"Without `pageSize` every channel is returned; `total` is always the full count.",
					},
				})
				.post(
					"/channels",
					async ({ body, admin, status }) => {
						const slug = body.slug.trim();
						const name = body.name.trim();
						if (!SLUG.test(slug) || !name)
							return status(400, { error: "invalid_channel" });
						return orchestrator.as(admin.id).createChannel({
							slug,
							name,
							kind: "web",
							accessMode: body.accessMode ?? "open",
							allowedOrigins: body.allowedOrigins ?? [],
						});
					},
					{
						body: CreateChannelInput,
						response: { 200: ChannelWithSecret, 400: ApiError, ...Upstream },
						detail: {
							summary: "Create a web-widget channel",
							description: "The secret key is returned once and never again.",
						},
					},
				)
				.patch(
					"/channels/:id",
					({ params, body, admin }) =>
						orchestrator.as(admin.id).updateChannel(params.id, {
							...body,
							name: body.name?.trim() || undefined,
						}),
					{
						params: Params,
						body: UpdateChannelInput,
						response: { 200: t.Object({ channel: Channel }), ...Upstream },
						detail: { summary: "Update / enable / disable a channel" },
					},
				)
				.post(
					"/channels/:id/rotate-keys",
					({ params, admin }) =>
						orchestrator.as(admin.id).rotateChannelKeys(params.id),
					{
						params: Params,
						response: { 200: ChannelWithSecret, ...Upstream },
						detail: { summary: "Rotate a channel's keys" },
					},
				)

				// --- blocked IPs ------------------------------------------------
				.get(
					"/blocked-ips",
					({ query }) => orchestrator.listBlockedIps(query),
					{
						query: PageQuery,
						response: {
							200: t.Object({ items: t.Array(BlockedIp), total: t.Number() }),
							...Upstream,
						},
						detail: {
							summary: "List blocked IPs, newest first",
							description:
								"Blocks match by IP hash; the plaintext `ip` is kept for display only (null on older rows).",
						},
					},
				)
				.post(
					"/blocked-ips",
					async ({ body, admin, status }) => {
						const ip = body.ip.trim();
						const reason = body.reason.trim();
						if (
							!ip ||
							!reason ||
							!Number.isFinite(body.expiresInHours) ||
							body.expiresInHours <= 0
						) {
							return status(400, { error: "invalid_block" });
						}
						return orchestrator.as(admin.id).createBlockedIp({
							ip,
							reason,
							expiresInHours: body.expiresInHours,
							channelId: body.channelId || undefined,
						});
					},
					{
						body: CreateBlockedIpInput,
						response: {
							200: t.Object({ item: BlockedIp }),
							400: ApiError,
							...Upstream,
						},
						detail: { summary: "Block an IP" },
					},
				)
				.delete(
					"/blocked-ips/:id",
					async ({ params, admin, set }) => {
						await orchestrator.as(admin.id).deleteBlockedIp(params.id);
						set.status = 204;
					},
					{ params: Params, detail: { summary: "Unblock an IP" } },
				),
		);
}
