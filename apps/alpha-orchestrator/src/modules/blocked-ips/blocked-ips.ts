import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { PageQuery } from "../http/http.ts";
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
	return new Elysia({ prefix: "/v1/admin/blocked-ips" })
		.get("/", ({ query }) => listBlockedIps(db, query), { query: PageQuery })
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
				body: t.Object({
					ip: t.String({ minLength: 1 }),
					channelId: t.Optional(t.String()),
					reason: t.String({ minLength: 1 }),
					// Mandatory expiry: IPs are shared (NAT, mobile networks).
					expiresInHours: t.Number({ exclusiveMinimum: 0 }),
				}),
			},
		)
		.delete("/:id", ({ params, status }) => {
			if (!deleteBlockedIp(db, params.id)) return status(404, "Not found");
			return new Response(null, { status: 204 });
		});
}
