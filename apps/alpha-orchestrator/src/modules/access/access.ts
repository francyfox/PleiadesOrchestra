import { Elysia, t } from "elysia";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
import { AccessBody, AccessResult } from "./access.schema.ts";
import { isAllowed } from "./access.service.ts";

export interface AccessDeps {
	db: Db;
	directory: ChannelDirectory;
	now: () => number;
}

/** `POST /v1/access` — transports ask whether a sender may talk to the bot (they stay silent if not). */
export function accessRoutes({ db, directory, now }: AccessDeps) {
	return new Elysia({ tags: ["Transport"] }).post(
		"/v1/access",
		({ body, status }) => {
			const channel = directory.bySlug(body.channel);
			if (!channel) return status(404, "Unknown channel");
			const visitor = upsertIdentifiedVisitor(
				db,
				channel.id,
				body.externalUserId,
				body.displayName,
				now(),
			);
			if (directory.suspension(channel))
				return {
					allowed: false,
					reason: "suspended" as const,
					userId: visitor.id,
				};
			return { allowed: isAllowed(channel, visitor), userId: visitor.id };
		},
		{
			body: AccessBody,
			response: { 200: AccessResult, 404: t.String() },
			detail: {
				summary: "Check sender access",
				description:
					"Transports ask whether a sender may talk to the bot; they stay silent when `allowed` is false. 404 for an unknown channel slug.",
			},
		},
	);
}
