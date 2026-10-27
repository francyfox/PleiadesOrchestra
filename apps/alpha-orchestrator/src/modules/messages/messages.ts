import { Elysia } from "elysia";
import { isAllowed } from "../access/access.service.ts";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import type { ReplyService } from "../reply/reply.ts";
import { ndjsonResponse } from "../streaming/streaming.service.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
import { MessageBody, NDJSON_LINES } from "./messages.schema.ts";

export interface MessagesDeps {
	db: Db;
	directory: ChannelDirectory;
	reply: ReplyService;
	now: () => number;
}

const DEFAULT_CHANNEL = "cli";

/** `POST /v1/messages` — a transport (Telegram, CLI, …) sends a user message and gets the reply as NDJSON. */
export function messagesRoutes({ db, directory, reply, now }: MessagesDeps) {
	return new Elysia({ tags: ["Transport"] }).post(
		"/v1/messages",
		({ body, status, request }) => {
			const channel = directory.bySlug(body.channel ?? DEFAULT_CHANNEL);
			if (!channel) return status(404, "Unknown channel");

			const timestamp = now();
			const visitor = upsertIdentifiedVisitor(
				db,
				channel.id,
				body.userId,
				body.displayName,
				timestamp,
			);
			// Denied visitors get silence: an empty 403, and the model is never called.
			if (!isAllowed(channel, visitor))
				return new Response(null, { status: 403 });

			const threadId = resolveThreadId(
				db,
				channel.id,
				visitor.id,
				body.threadId,
				timestamp,
			);
			const stream = reply.startReply(visitor, threadId, body.text, {
				signal: request.signal,
				replyTo: body.replyTo,
			});
			return ndjsonResponse(stream, request);
		},
		{
			body: MessageBody,
			detail: {
				summary: "Send a message and stream the reply",
				description: `A transport (Telegram, CLI, ...) sends a user message; \`channel\` defaults to \`cli\`. 404 unknown channel (text), 403 empty body when the sender is not allowed (the model is never called).\n\n${NDJSON_LINES}`,
			},
		},
	);
}
