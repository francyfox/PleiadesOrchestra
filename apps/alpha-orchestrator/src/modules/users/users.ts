import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { adminIdOf } from "../http/http.service.ts";
import { oneOf } from "../http/http.ts";
import { applyUserAction, deleteUserMessages } from "./users.service.ts";
import type { UserAction } from "./users.types.ts";
import { getUserDetail } from "./users-detail.service.ts";
import { getAdminUser, listUsers } from "./users-list.service.ts";

export interface UsersDeps {
	db: Db;
	now: () => number;
}

/** Admin routes for chat users. Auth is enforced by the app's `onRequest` guard. */
export function usersRoutes({ db, now }: UsersDeps) {
	/** Handler for the single-user whitelist/unwhitelist/block/unblock routes. */
	const singleUserAction =
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
				adminIdOf(request),
				now(),
				reason,
			);
			if (updated === 0) return status(404, "Not found");
			return { user: getAdminUser(db, params.id) };
		};

	return new Elysia({ prefix: "/v1/admin/users" })
		.get(
			"/",
			({ query }) =>
				listUsers(db, {
					channel: query.channel,
					kind: query.kind,
					status: query.status,
					q: query.q,
					sort: query.sort ?? "lastSeenAt",
					order: query.order ?? "desc",
					from: query.from ?? 0,
					to: query.to ?? now(),
					cursor: query.cursor,
					limit: query.limit ?? 50,
				}),
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
			"/bulk",
			({ body, request }) => ({
				updated: applyUserAction(
					db,
					body.ids,
					body.action,
					adminIdOf(request),
					now(),
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
		.get("/:id", ({ params, status }) => {
			const detail = getUserDetail(db, params.id, now());
			return detail ?? status(404, "Not found");
		})
		.post("/:id/whitelist", singleUserAction("whitelist"))
		.post("/:id/unwhitelist", singleUserAction("unwhitelist"))
		.post("/:id/block", singleUserAction("block"), {
			body: t.Optional(t.Object({ reason: t.Optional(t.String()) })),
		})
		.post("/:id/unblock", singleUserAction("unblock"))
		.delete("/:id/messages", ({ params, status }) => {
			if (!getAdminUser(db, params.id)) return status(404, "Not found");
			deleteUserMessages(db, params.id);
			return new Response(null, { status: 204 });
		});
}
