import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { PageQuery } from "../http/http.ts";
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
}

/** Admin routes for blocked IPs. Auth is enforced by the app's `onRequest` guard. */
export function blockedIpsRoutes({ db, ipHashSalt, now }: BlockedIpsDeps) {
	return new Elysia({
		prefix: "/v1/admin/blocked-ips",
		tags: ["Admin: blocked IPs"],
	})
		.get("/", ({ query }) => listBlockedIps(db, query), {
			query: PageQuery,
			response: { 200: BlockedIpsPage },
			detail: {
				summary: "List blocked IPs",
				description:
					"Newest first. Without `pageSize` the whole list is returned.",
			},
		})
		.post(
			"/",
			({ body, status }) => {
				try {
					return { item: createBlockedIp(db, body, ipHashSalt, now()) };
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
