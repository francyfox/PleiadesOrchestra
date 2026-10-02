import { Elysia, t } from "elysia";
import { isAllowed } from "../access/access.service.ts";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import type { ReplyService } from "../reply/reply.ts";
import { ndjsonResponse } from "../streaming/streaming.service.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedUser } from "../users/users.service.ts";

export interface MessagesDeps {
	db: Db;
	directory: ChannelDirectory;
	reply: ReplyService;
	now: () => number;
}

const DEFAULT_CHANNEL = "cli";

/** `POST /v1/messages` — a transport (Telegram, CLI, …) sends a user message and gets the reply as NDJSON. */
export function messagesRoutes({ db, directory, reply, now }: MessagesDeps) {
	return new Elysia().post(
		"/v1/messages",
		({ body, status, request }) => {
			const channel = directory.bySlug(body.channel ?? DEFAULT_CHANNEL);
			if (!channel) return status(404, "Unknown channel");

			const timestamp = now();
			const user = upsertIdentifiedUser(
				db,
				channel.id,
				body.userId,
				body.displayName,
				timestamp,
			);
			// Denied users get silence: an empty 403, and the model is never called.
			if (!isAllowed(channel, user)) return new Response(null, { status: 403 });

			const threadId = resolveThreadId(
				db,
				channel.id,
				user.id,
				body.threadId,
				timestamp,
			);
			const stream = reply.startReply(user, threadId, body.text, {
				signal: request.signal,
			});
			return ndjsonResponse(stream, request);
		},
		{
			body: t.Object({
				threadId: t.String(),
				/** External user id within the channel. */
				userId: t.String(),
				text: t.String(),
				channel: t.Optional(t.String()),
				displayName: t.Optional(t.String()),
			}),
		},
	);
}
