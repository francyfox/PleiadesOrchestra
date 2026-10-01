import { Elysia, t } from "elysia";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";
import { isAllowed } from "./access.service.ts";

export interface AccessDeps {
	db: Db;
	directory: ChannelDirectory;
	now: () => number;
}

/** `POST /v1/access` — transports ask whether a sender may talk to the bot (they stay silent if not). */
export function accessRoutes({ db, directory, now }: AccessDeps) {
	return new Elysia().post(
		"/v1/access",
		({ body, status }) => {
			const channel = directory.bySlug(body.channel);
			if (!channel) return status(404, "Unknown channel");
			const user = upsertIdentifiedUser(
				db,
				channel.id,
				body.externalUserId,
				body.displayName,
				now(),
			);
			return { allowed: isAllowed(channel, user), userId: user.id };
		},
		{
			body: t.Object({
				channel: t.String(),
				externalUserId: t.String(),
				displayName: t.Optional(t.String()),
			}),
		},
	);
}
