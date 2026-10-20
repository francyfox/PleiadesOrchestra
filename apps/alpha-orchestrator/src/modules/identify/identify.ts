import { Elysia, t } from "elysia";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { ChannelRow } from "../channels/channels.types.ts";
import type { Db } from "../database/database.ts";
import { matchesHash } from "../security/security.service.ts";
import { IdentifyBody, IdentifyResult } from "./identify.schema.ts";
import { identifyVisitor } from "./identify.service.ts";

export interface IdentifyDeps {
	db: Db;
	directory: ChannelDirectory;
	retentionPerUser: number;
	now: () => number;
}

/** `Authorization: Bearer <channel secret key>`, compared by hash in constant time. */
function hasChannelSecret(channel: ChannelRow, authorization: string | null) {
	if (channel.kind !== "web" || !channel.secretKeyHash) return false;
	if (!authorization?.startsWith("Bearer ")) return false;
	return matchesHash(
		authorization.slice("Bearer ".length),
		channel.secretKeyHash,
	);
}

const empty = (status: number) => new Response(null, { status });

/**
 * `POST /v1/channels/:slug/identify` — the host site's backend links a widget
 * visitor to its own account. Server-to-server: authenticated by the
 * channel's secret key, not by the transport/admin keys.
 */
export function identifyRoutes({
	db,
	directory,
	retentionPerUser,
	now,
}: IdentifyDeps) {
	return new Elysia({ tags: ["Widget"] }).post(
		"/v1/channels/:slug/identify",
		({ request, params, body }) => {
			const channel = directory.bySlug(params.slug);
			if (!channel) return empty(404);
			if (!hasChannelSecret(channel, request.headers.get("authorization"))) {
				return empty(401);
			}
			const result = identifyVisitor(db, {
				channelId: channel.id,
				visitorToken: body.visitorToken,
				externalUserId: body.externalUserId,
				retentionPerUser,
				now: now(),
			});
			if (result.status === "unknown_visitor") return empty(404);
			if (result.status === "conflict") return empty(409);
			return { userId: result.visitorId, merged: result.merged };
		},
		{
			body: IdentifyBody,
			response: {
				200: IdentifyResult,
				401: t.Void(),
				404: t.Void(),
				409: t.Void(),
			},
			detail: {
				summary: "Link a widget visitor to a site account",
				description:
					"Server-to-server call from the host site's backend; send `Authorization: Bearer <channel secret key>`. 401 bad or missing key, 404 unknown channel or visitor token, 409 token already bound to a different account. Errors have empty bodies.",
			},
		},
	);
}
