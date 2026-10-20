import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import { IdParams, Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	BulkAction,
	Visitor,
	VisitorDetails,
	VisitorsPage,
	VisitorsQuery,
} from "./visitors.schema.ts";
import { cleanReason } from "./visitors.service.ts";

const VisitorResponse = t.Object({ visitor: Visitor });

/**
 * Chat visitors, proxied to the orchestrator. Every mutation carries the
 * signed-in admin's id (`X-Admin-Id`) for the audit fields.
 */
export function visitorsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.visitors", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/visitors", ({ query }) => orchestrator.listVisitors(query), {
					query: VisitorsQuery,
					response: { 200: VisitorsPage, ...Upstream },
					detail: { summary: "List chat visitors (cursor-paginated)" },
				})
				.post(
					"/visitors/bulk",
					async ({ body, admin, status }) => {
						if (body.ids.length === 0) {
							return status(400, { error: "no_selection" });
						}
						return orchestrator
							.as(admin.id)
							.bulkVisitors(body.ids, body.action, cleanReason(body.reason));
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
						detail: { summary: "Apply one action to many visitors" },
					},
				)
				.get(
					"/visitors/:id",
					({ params }) => orchestrator.getVisitor(params.id),
					{
						params: IdParams,
						response: { 200: VisitorDetails, ...Upstream },
						detail: { summary: "A visitor with messages and usage" },
					},
				)
				.post(
					"/visitors/:id/whitelist",
					({ params, admin }) =>
						orchestrator.as(admin.id).whitelistVisitor(params.id),
					{
						params: IdParams,
						response: { 200: VisitorResponse, ...Upstream },
						detail: { summary: "Allow a visitor" },
					},
				)
				.post(
					"/visitors/:id/unwhitelist",
					({ params, admin }) =>
						orchestrator.as(admin.id).unwhitelistVisitor(params.id),
					{
						params: IdParams,
						response: { 200: VisitorResponse, ...Upstream },
						detail: { summary: "Remove a visitor from the whitelist" },
					},
				)
				.post(
					"/visitors/:id/block",
					({ params, body, admin }) =>
						orchestrator
							.as(admin.id)
							.blockVisitor(params.id, cleanReason(body?.reason)),
					{
						params: IdParams,
						body: t.Optional(t.Object({ reason: t.Optional(t.String()) })),
						response: { 200: VisitorResponse, ...Upstream },
						detail: { summary: "Block a visitor" },
					},
				)
				.post(
					"/visitors/:id/unblock",
					({ params, admin }) =>
						orchestrator.as(admin.id).unblockVisitor(params.id),
					{
						params: IdParams,
						response: { 200: VisitorResponse, ...Upstream },
						detail: { summary: "Unblock a visitor" },
					},
				)
				.delete(
					"/visitors/:id/messages",
					async ({ params, admin, set }) => {
						await orchestrator.as(admin.id).deleteVisitorMessages(params.id);
						set.status = 204;
					},
					{
						params: IdParams,
						detail: { summary: "Delete a visitor's stored messages" },
					},
				),
		);
}
