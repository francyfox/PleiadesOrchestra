import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import { IdParams, Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	AdminUser,
	BulkAction,
	UserDetails,
	UsersPage,
	UsersQuery,
} from "./users.schema.ts";
import { cleanReason } from "./users.service.ts";

const UserResponse = t.Object({ user: AdminUser });

/**
 * Chat users, proxied to the orchestrator. Every mutation carries the
 * signed-in admin's id (`X-Admin-Id`) for the audit fields.
 */
export function usersRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.users", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/users", ({ query }) => orchestrator.listUsers(query), {
					query: UsersQuery,
					response: { 200: UsersPage, ...Upstream },
					detail: { summary: "List chat users (cursor-paginated)" },
				})
				.post(
					"/users/bulk",
					async ({ body, admin, status }) => {
						if (body.ids.length === 0) {
							return status(400, { error: "no_selection" });
						}
						return orchestrator
							.as(admin.id)
							.bulkUsers(body.ids, body.action, cleanReason(body.reason));
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
					params: IdParams,
					response: { 200: UserDetails, ...Upstream },
					detail: { summary: "A user with messages and usage" },
				})
				.post(
					"/users/:id/whitelist",
					({ params, admin }) =>
						orchestrator.as(admin.id).whitelistUser(params.id),
					{
						params: IdParams,
						response: { 200: UserResponse, ...Upstream },
						detail: { summary: "Allow a user" },
					},
				)
				.post(
					"/users/:id/unwhitelist",
					({ params, admin }) =>
						orchestrator.as(admin.id).unwhitelistUser(params.id),
					{
						params: IdParams,
						response: { 200: UserResponse, ...Upstream },
						detail: { summary: "Remove a user from the whitelist" },
					},
				)
				.post(
					"/users/:id/block",
					({ params, body, admin }) =>
						orchestrator
							.as(admin.id)
							.blockUser(params.id, cleanReason(body?.reason)),
					{
						params: IdParams,
						body: t.Optional(t.Object({ reason: t.Optional(t.String()) })),
						response: { 200: UserResponse, ...Upstream },
						detail: { summary: "Block a user" },
					},
				)
				.post(
					"/users/:id/unblock",
					({ params, admin }) =>
						orchestrator.as(admin.id).unblockUser(params.id),
					{
						params: IdParams,
						response: { 200: UserResponse, ...Upstream },
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
						params: IdParams,
						detail: { summary: "Delete a user's stored messages" },
					},
				),
		);
}
