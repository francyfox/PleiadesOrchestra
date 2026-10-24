import { t } from "elysia";

export const VisitorResult = t.Object({
	visitorToken: t.String(),
	/** Epoch ms. */
	expiresAt: t.Number(),
});

export const WidgetThreadResult = t.Object({ threadId: t.String() });

/** A flow line as the visitor saw it. */
const StoredStepSchema = t.Object({
	id: t.String(),
	phase: t.Union([
		t.Literal("running"),
		t.Literal("done"),
		t.Literal("failed"),
	]),
	text: t.String(),
});

export const ThreadMessage = t.Object({
	id: t.String(),
	role: t.Union([t.Literal("user"), t.Literal("assistant")]),
	content: t.String(),
	/** Epoch ms. */
	createdAt: t.Number(),
	/** Flow lines of an assistant reply that used tools. */
	steps: t.Optional(t.Array(StoredStepSchema)),
});

export const ThreadMessagesResult = t.Object({ items: t.Array(ThreadMessage) });

export const SuspendedResult = t.Object({
	code: t.Literal("channel_suspended"),
});

export const PendingResult = t.Union([
	t.Object({ state: t.Literal("none") }),
	t.Object({
		state: t.Literal("waiting"),
		callId: t.String(),
		tool: t.String(),
		arguments: t.Record(t.String(), t.Unknown()),
		tasksLeft: t.Number(),
	}),
	t.Object({
		state: t.Literal("interrupted"),
		runId: t.String(),
		prompt: t.String(),
		tasksLeft: t.Number(),
	}),
	t.Object({
		state: t.Literal("expired"),
		prompt: t.String(),
		tasksLeft: t.Number(),
	}),
]);
