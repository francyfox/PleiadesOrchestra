import type { GoapAction } from "@repo/core";
import { Elysia, t } from "elysia";
import type { Db } from "../db/client.ts";
import type { ChannelDirectory } from "../db/identity.ts";
import {
	createBlockedIp,
	createWebChannel,
	deleteBlockedIp,
	listBlockedIps,
	listChannels,
	rotateChannelKeys,
	SlugTakenError,
	UnknownChannelError,
	updateChannel,
} from "./channels.ts";
import {
	applyUserAction,
	deleteUserMessages,
	getAdminUser,
	getRun,
	getUserDetail,
	listUsers,
	stats,
	type UserAction,
	usageRows,
} from "./queries.ts";

export interface AdminDeps {
	db: Db;
	channels: ChannelDirectory;
	/** GOAP catalog served by /goap/actions (without `execute`). */
	actions: GoapAction[];
	ipHashSalt: string;
	now: () => number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Auth (ADMIN_API_KEY, X-Admin-Id on mutations) is enforced in server.ts's `onRequest` hook. */
function adminId(request: Request): string {
	return request.headers.get("x-admin-id") ?? "";
}

/**
 * Enum schema. Not `t.UnionEnum`: inside `t.Optional` Elysia fills a missing
 * `UnionEnum` field with its first value (verified: an absent `?status=` became
 * "allowed"), which would silently filter lists and flip PATCHed fields.
 */
function oneOf<const T extends string>(values: readonly T[]) {
	return t.Union(values.map((value) => t.Literal(value)));
}

const AccessMode = oneOf(["whitelist", "open"]);
const Slug = t.String({ pattern: "^[a-z0-9][a-z0-9-]*$", maxLength: 64 });

export function adminRoutes(deps: AdminDeps) {
	const { db } = deps;

	const userAction =
		(action: UserAction) =>
		({
			params,
			request,
			body,
			status,
		}: {
			params: { id: string };
			request: Request;
			body: unknown;
			status: (code: 404, response: string) => unknown;
		}) => {
			// Only `block` declares a body schema (`{ reason? }`); for the others it's ignored.
			const reason = (body as { reason?: string } | null | undefined)?.reason;
			const updated = applyUserAction(
				db,
				[params.id],
				action,
				adminId(request),
				deps.now(),
				reason,
			);
			if (updated === 0) return status(404, "Not found");
			return { user: getAdminUser(db, params.id) };
		};

	return new Elysia({ prefix: "/v1/admin" })
		.get(
			"/users",
			({ query }) => {
				const now = deps.now();
				return listUsers(db, {
					channel: query.channel,
					kind: query.kind,
					status: query.status,
					q: query.q,
					sort: query.sort ?? "lastSeenAt",
					order: query.order ?? "desc",
					from: query.from ?? 0,
					to: query.to ?? now,
					cursor: query.cursor,
					limit: query.limit ?? 50,
				});
			},
			{
				query: t.Object({
					channel: t.Optional(t.String()),
					kind: t.Optional(oneOf(["identified", "anonymous"])),
					status: t.Optional(oneOf(["allowed", "pending", "blocked"])),
					q: t.Optional(t.String()),
					sort: t.Optional(oneOf(["lastSeenAt", "createdAt", "tokens"])),
					order: t.Optional(oneOf(["asc", "desc"])),
					from: t.Optional(t.Numeric()),
					to: t.Optional(t.Numeric()),
					cursor: t.Optional(t.String()),
					limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
				}),
			},
		)
		.post(
			"/users/bulk",
			({ body, request }) => ({
				updated: applyUserAction(
					db,
					body.ids,
					body.action,
					adminId(request),
					deps.now(),
					body.reason,
				),
			}),
			{
				body: t.Object({
					ids: t.Array(t.String(), { maxItems: 1000 }),
					action: oneOf(["whitelist", "unwhitelist", "block", "unblock"]),
					reason: t.Optional(t.String()),
				}),
			},
		)
		.get("/users/:id", ({ params, status }) => {
			const detail = getUserDetail(db, params.id, deps.now());
			return detail ?? status(404, "Not found");
		})
		.post("/users/:id/whitelist", userAction("whitelist"))
		.post("/users/:id/unwhitelist", userAction("unwhitelist"))
		.post("/users/:id/block", userAction("block"), {
			body: t.Optional(t.Object({ reason: t.Optional(t.String()) })),
		})
		.post("/users/:id/unblock", userAction("unblock"))
		.delete("/users/:id/messages", ({ params, status }) => {
			if (!getAdminUser(db, params.id)) return status(404, "Not found");
			deleteUserMessages(db, params.id);
			return new Response(null, { status: 204 });
		})
		.get(
			"/usage",
			({ query }) => {
				const now = deps.now();
				return {
					rows: usageRows(
						db,
						query.groupBy,
						query.from ?? now - 30 * DAY_MS,
						query.to ?? now,
						query.channel,
					),
				};
			},
			{
				query: t.Object({
					groupBy: oneOf(["day", "user", "channel", "model"]),
					from: t.Optional(t.Numeric()),
					to: t.Optional(t.Numeric()),
					channel: t.Optional(t.String()),
				}),
			},
		)
		.get("/stats", () => stats(db, deps.now()))
		.get("/runs/:id", ({ params, status }) => {
			return getRun(db, params.id) ?? status(404, "Not found");
		})
		.get("/goap/actions", () => ({
			actions: deps.actions.map(({ name, cost, preconditions, effects }) => ({
				name,
				cost,
				preconditions,
				effects,
			})),
		}))
		.get("/channels", () => ({ items: listChannels(db) }))
		.post(
			"/channels",
			({ body, status }) => {
				try {
					const created = createWebChannel(
						db,
						{
							slug: body.slug,
							name: body.name,
							accessMode: body.accessMode,
							allowedOrigins: body.allowedOrigins,
						},
						deps.now(),
					);
					deps.channels.invalidate();
					return created;
				} catch (error) {
					if (error instanceof SlugTakenError) {
						return status(409, "Slug already taken");
					}
					throw error;
				}
			},
			{
				body: t.Object({
					slug: Slug,
					name: t.String({ minLength: 1 }),
					kind: t.Literal("web"),
					accessMode: AccessMode,
					allowedOrigins: t.Array(t.String()),
				}),
			},
		)
		.patch(
			"/channels/:id",
			({ params, body, status }) => {
				const channel = updateChannel(db, params.id, body, deps.now());
				if (!channel) return status(404, "Not found");
				deps.channels.invalidate();
				return { channel };
			},
			{
				body: t.Object({
					name: t.Optional(t.String({ minLength: 1 })),
					accessMode: t.Optional(AccessMode),
					allowedOrigins: t.Optional(t.Array(t.String())),
					disabled: t.Optional(t.Boolean()),
				}),
			},
		)
		.post("/channels/:id/rotate-keys", ({ params, status }) => {
			const rotated = rotateChannelKeys(db, params.id);
			if (!rotated) return status(404, "Not found");
			deps.channels.invalidate();
			return rotated;
		})
		.get("/blocked-ips", () => ({ items: listBlockedIps(db) }))
		.post(
			"/blocked-ips",
			({ body, status }) => {
				try {
					return {
						item: createBlockedIp(db, body, deps.ipHashSalt, deps.now()),
					};
				} catch (error) {
					if (error instanceof UnknownChannelError) {
						return status(404, "Unknown channel");
					}
					throw error;
				}
			},
			{
				body: t.Object({
					ip: t.String({ minLength: 1 }),
					channelId: t.Optional(t.String()),
					reason: t.String({ minLength: 1 }),
					// Mandatory expiry: IPs are shared (NAT, mobile networks).
					expiresInHours: t.Number({ exclusiveMinimum: 0 }),
				}),
			},
		)
		.delete("/blocked-ips/:id", ({ params, status }) => {
			if (!deleteBlockedIp(db, params.id)) return status(404, "Not found");
			return new Response(null, { status: 204 });
		});
}
