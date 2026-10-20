import { Elysia, type ElysiaCustomStatusResponse, t } from "elysia";
import type { Db } from "../database/database.ts";
import { adminIdOf } from "../http/http.service.ts";
import {
	BlockVisitorBody,
	BulkVisitorsBody,
	BulkVisitorsResult,
	VisitorDetail,
	VisitorResult,
	VisitorsPage,
	VisitorsQuery,
} from "./visitors.schema.ts";
import {
	applyVisitorAction,
	deleteVisitorMessages,
} from "./visitors.service.ts";
import type { AdminVisitor, VisitorAction } from "./visitors.types.ts";
import { getVisitorDetail } from "./visitors-detail.service.ts";
import { getAdminVisitor, listVisitors } from "./visitors-list.service.ts";

export interface VisitorsDeps {
	db: Db;
	now: () => number;
}

/** Admin routes for chat visitors. Auth is enforced by the app's `onRequest` guard. */
export function visitorsRoutes({ db, now }: VisitorsDeps) {
	/** Handler for the single-visitor whitelist/unwhitelist/block/unblock routes. */
	const singleVisitorAction =
		(action: VisitorAction) =>
		({
			params,
			request,
			body,
			status,
		}: {
			params: { id: string };
			request: Request;
			body: unknown;
			status: (
				code: 404,
				response: string,
			) => ElysiaCustomStatusResponse<404, string>;
		}) => {
			// Only `block` declares a body schema (`{ reason? }`); for the others it's ignored.
			const reason = (body as { reason?: string } | null | undefined)?.reason;
			const updated = applyVisitorAction(
				db,
				[params.id],
				action,
				adminIdOf(request),
				now(),
				reason,
			);
			if (updated === 0) return status(404, "Not found");
			// The visitor exists: `updated > 0`.
			return { visitor: getAdminVisitor(db, params.id) as AdminVisitor };
		};

	return new Elysia({ prefix: "/v1/admin/visitors", tags: ["Admin: visitors"] })
		.get(
			"/",
			({ query }) =>
				listVisitors(db, {
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
				query: VisitorsQuery,
				response: { 200: VisitorsPage },
				detail: {
					summary: "List visitors",
					description:
						"Filtered, sorted page of visitors with token usage in the `from`..`to` window (unix ms). Page with the opaque `nextCursor`.",
				},
			},
		)
		.post(
			"/bulk",
			({ body, request }) => ({
				updated: applyVisitorAction(
					db,
					body.ids,
					body.action,
					adminIdOf(request),
					now(),
					body.reason,
				),
			}),
			{
				body: BulkVisitorsBody,
				response: { 200: BulkVisitorsResult },
				detail: {
					summary: "Apply an action to many visitors",
					description:
						"Whitelist, unwhitelist, block or unblock up to 1000 visitors. `reason` is stored only for `block`. Unknown ids are skipped; `updated` counts the changed visitors.",
				},
			},
		)
		.get(
			"/:id",
			({ params, status }) => {
				const detail = getVisitorDetail(db, params.id, now());
				return detail ?? status(404, "Not found");
			},
			{
				response: { 200: VisitorDetail, 404: t.String() },
				detail: {
					summary: "Get a visitor",
					description:
						"The visitor with the latest messages and usage of the last 30 days.",
				},
			},
		)
		.post("/:id/whitelist", singleVisitorAction("whitelist"), {
			response: { 200: VisitorResult, 404: t.String() },
			detail: { summary: "Whitelist a visitor" },
		})
		.post("/:id/unwhitelist", singleVisitorAction("unwhitelist"), {
			response: { 200: VisitorResult, 404: t.String() },
			detail: { summary: "Remove a visitor from the whitelist" },
		})
		.post("/:id/block", singleVisitorAction("block"), {
			body: BlockVisitorBody,
			response: { 200: VisitorResult, 404: t.String() },
			detail: {
				summary: "Block a visitor",
				description: "The optional `reason` is stored with the block.",
			},
		})
		.post("/:id/unblock", singleVisitorAction("unblock"), {
			response: { 200: VisitorResult, 404: t.String() },
			detail: { summary: "Unblock a visitor" },
		})
		.delete(
			"/:id/messages",
			({ params, status }) => {
				if (!getAdminVisitor(db, params.id)) return status(404, "Not found");
				deleteVisitorMessages(db, params.id);
				return new Response(null, { status: 204 });
			},
			{
				response: { 204: t.Void(), 404: t.String() },
				detail: {
					summary: "Delete a visitor's messages",
					description: "Permanently removes the visitor's message history.",
				},
			},
		);
}
