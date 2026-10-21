import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ownerScope } from "../channels/channels.service.ts";
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
import { assertVisitorAccess, cleanReason } from "./visitors.service.ts";

const VisitorResponse = t.Object({ visitor: Visitor });

/**
 * Chat visitors, proxied to the orchestrator. Every mutation carries the
 * signed-in account's id (`X-Admin-Id`) for the audit fields. Staff see all; a
 * user only visitors of their own channels (another owner's visitor is 404).
 */
export function visitorsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.visitors", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ account: true }, (app) =>
			app
				.get(
					"/visitors",
					({ query, account }) =>
						orchestrator.listVisitors({
							...query,
							ownerId: ownerScope(account) ?? query.ownerId,
						}),
					{
						query: VisitorsQuery,
						response: { 200: VisitorsPage, ...Upstream },
						detail: { summary: "List chat visitors (cursor-paginated)" },
					},
				)
				.post(
					"/visitors/bulk",
					async ({ body, account, status }) => {
						if (body.ids.length === 0) {
							return status(400, { error: "no_selection" });
						}
						return orchestrator
							.as(account.id)
							.bulkVisitors(
								body.ids,
								body.action,
								cleanReason(body.reason),
								ownerScope(account),
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
						detail: { summary: "Apply one action to many visitors" },
					},
				)
				.get(
					"/visitors/:id",
					({ params, account }) =>
						orchestrator.getVisitor(params.id, ownerScope(account)),
					{
						params: IdParams,
						response: { 200: VisitorDetails, ...Upstream },
						detail: { summary: "A visitor with messages and usage" },
					},
				)
				.post(
					"/visitors/:id/whitelist",
					async ({ params, account }) => {
						await assertVisitorAccess(orchestrator, account, params.id);
						return orchestrator.as(account.id).whitelistVisitor(params.id);
					},
					{
						params: IdParams,
						response: { 200: VisitorResponse, ...Upstream },
						detail: { summary: "Allow a visitor" },
					},
				)
				.post(
					"/visitors/:id/unwhitelist",
					async ({ params, account }) => {
						await assertVisitorAccess(orchestrator, account, params.id);
						return orchestrator.as(account.id).unwhitelistVisitor(params.id);
					},
					{
						params: IdParams,
						response: { 200: VisitorResponse, ...Upstream },
						detail: { summary: "Remove a visitor from the whitelist" },
					},
				)
				.post(
					"/visitors/:id/block",
					async ({ params, body, account }) => {
						await assertVisitorAccess(orchestrator, account, params.id);
						return orchestrator
							.as(account.id)
							.blockVisitor(params.id, cleanReason(body?.reason));
					},
					{
						params: IdParams,
						body: t.Optional(t.Object({ reason: t.Optional(t.String()) })),
						response: { 200: VisitorResponse, ...Upstream },
						detail: { summary: "Block a visitor" },
					},
				)
				.post(
					"/visitors/:id/unblock",
					async ({ params, account }) => {
						await assertVisitorAccess(orchestrator, account, params.id);
						return orchestrator.as(account.id).unblockVisitor(params.id);
					},
					{
						params: IdParams,
						response: { 200: VisitorResponse, ...Upstream },
						detail: { summary: "Unblock a visitor" },
					},
				)
				.delete(
					"/visitors/:id/messages",
					async ({ params, account, set }) => {
						await assertVisitorAccess(orchestrator, account, params.id);
						await orchestrator.as(account.id).deleteVisitorMessages(params.id);
						set.status = 204;
					},
					{
						params: IdParams,
						detail: { summary: "Delete a visitor's stored messages" },
					},
				),
		);
}
