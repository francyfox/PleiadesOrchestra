import { Elysia } from "elysia";
import { isAllowed } from "../access/access.service.ts";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import type { ReplyService } from "../reply/reply.ts";
import {
	ndjsonResponse,
	releaseWhenDone,
} from "../streaming/streaming.service.ts";
import { resolveThreadId } from "../threads/threads.service.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
import { MessageBody, NDJSON_LINES } from "./messages.schema.ts";

export interface MessagesDeps {
	db: Db;
	directory: ChannelDirectory;
	reply: ReplyService;
	now: () => number;
	/** Same cap as the widget's text: bounds what any model (and the guardrails) reads. */
	maxTextChars: number;
}

const DEFAULT_CHANNEL = "cli";

/** `POST /v1/messages` — a transport (Telegram, CLI, …) sends a user message and gets the reply as NDJSON. */
export function messagesRoutes({
	db,
	directory,
	reply,
	now,
	maxTextChars,
}: MessagesDeps) {
	return new Elysia({ tags: ["Transport"] }).post(
		"/v1/messages",
		({ body, status, request }) => {
			if (body.text.length > maxTextChars) return status(413, "Text too long");
			const channel = directory.bySlug(body.channel ?? DEFAULT_CHANNEL);
			if (!channel) return status(404, "Unknown channel");
			// Same guard as the widget: an owner at zero TR gets no model calls.
			if (directory.suspension(channel))
				return status(402, { code: "channel_suspended" as const });

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
			const release = directory.reserve(channel);
			if (!release) return status(402, { code: "channel_suspended" as const });
			const stream = reply.startReply(visitor, threadId, body.text, {
				signal: request.signal,
				replyTo: body.replyTo,
			});
			return ndjsonResponse(releaseWhenDone(stream, release), request);
		},
		{
			body: MessageBody,
			detail: {
				summary: "Send a message and stream the reply",
				description: `A transport (Telegram, CLI, ...) sends a user message; \`channel\` defaults to \`cli\`. 404 unknown channel (text), 402 \`{ code: "channel_suspended" }\` when the channel's owner has no TR left, 403 empty body when the sender is not allowed (the model is never called in either case).\n\n${NDJSON_LINES}`,
			},
		},
	);
}
