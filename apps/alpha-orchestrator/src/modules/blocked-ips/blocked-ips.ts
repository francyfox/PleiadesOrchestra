import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { PageQuery } from "../http/http.ts";
import { OwnerQuery } from "../visitors/visitors.schema.ts";
import type { Emit } from "../webhooks/webhooks.types.ts";
import {
	BlockedIpResult,
	BlockedIpsPage,
	CreateBlockedIpBody,
} from "./blocked-ips.schema.ts";
import {
	createBlockedIp,
	deleteBlockedIp,
	listBlockedIps,
	UnknownChannelError,
} from "./blocked-ips.service.ts";

export interface BlockedIpsDeps {
	db: Db;
	ipHashSalt: string;
	now: () => number;
	emit?: Emit;
}

/** Admin routes for blocked IPs. Auth is enforced by the app's `onRequest` guard. */
export function blockedIpsRoutes({
	db,
	ipHashSalt,
	now,
	emit,
}: BlockedIpsDeps) {
	return new Elysia({
		prefix: "/v1/admin/blocked-ips",
		tags: ["Admin: blocked IPs"],
	})
		.get("/", ({ query }) => listBlockedIps(db, query), {
			query: t.Composite([PageQuery, OwnerQuery]),
			response: { 200: BlockedIpsPage },
			detail: {
				summary: "List blocked IPs",
				description:
					"Newest first. Without `pageSize` the whole list is returned. `ownerId` keeps only blocks of that account's channels (no global ones).",
			},
		})
		.post(
			"/",
			({ body, status }) => {
				try {
					const item = createBlockedIp(db, body, ipHashSalt, now());
					emit?.("ip.blocked", {
						ip: body.ip,
						channelId: item.channelId,
						reason: item.reason,
						expiresAt: item.expiresAt,
					});
					return { item };
				} catch (error) {
					if (error instanceof UnknownChannelError) {
						return status(404, "Unknown channel");
					}
					throw error;
				}
			},
			{
				body: CreateBlockedIpBody,
				response: { 200: BlockedIpResult, 404: t.String() },
				detail: {
					summary: "Block an IP",
					description:
						"Without `channelId` the block is global. Expires after `expiresInHours`. 404 if the channel does not exist.",
				},
			},
		)
		.delete(
			"/:id",
			({ params, status }) => {
				if (!deleteBlockedIp(db, params.id)) return status(404, "Not found");
				return new Response(null, { status: 204 });
			},
			{
				response: { 204: t.Void(), 404: t.String() },
				detail: { summary: "Unblock an IP" },
			},
		);
}
