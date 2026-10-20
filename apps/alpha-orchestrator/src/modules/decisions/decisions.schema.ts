import { t } from "elysia";

export const DecisionsBody = t.Object({
	/** Opaque decision state handed to the decision agent. */
	state: t.Unknown(),
	/** Question id to question (`choice` / `score` / `boolean`). */
	questions: t.Record(t.String(), t.Unknown()),
});

export const DecisionsResult = t.Object({
	/** Question id to answer, in the AI SDK decision shapes. */
	answers: t.Record(t.String(), t.Unknown()),
});
