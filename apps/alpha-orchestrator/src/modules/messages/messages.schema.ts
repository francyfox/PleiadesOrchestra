import { t } from "elysia";
import { REPLY_TO_MAX } from "../goap/goap.types.ts";

export const MessageBody = t.Object({
	threadId: t.String(),
	/** External user id within the channel. */
	userId: t.String(),
	text: t.String(),
	/** The assistant message the sender answers (a picked option). */
	replyTo: t.Optional(t.String({ maxLength: REPLY_TO_MAX })),
	channel: t.Optional(t.String()),
	displayName: t.Optional(t.String()),
});

/** NDJSON line shapes of a reply stream, shared by the transport and widget descriptions. */
export const NDJSON_LINES = `Streams application/x-ndjson (gzip if accepted), one JSON object per line:
{"type":"delta","text":"..."} model text as it is written;
{"type":"step","id":"...","phase":"running|done|failed","text":"..."} progress line, a later line with the same id replaces the earlier one;
then exactly one terminal line:
{"type":"done","elapsedMs":123,"inputTokens":1,"outputTokens":2,"totalInputTokens":1,"totalOutputTokens":2} (token fields optional),
{"type":"tool_call","tool":"...","arguments":{},"callId":"..."} the browser must run the tool and POST /v1/widget/tool-results (widget only),
{"type":"cancelled"} the visitor gave up on a pending tool call (answer to a tool-results POST with cancelled: true; nothing was said),
{"type":"error","message":"...","code":"task_failed","hint":"..."} (code and hint optional).`;
