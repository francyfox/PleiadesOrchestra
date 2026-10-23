import { ALL_INTENT_IDS } from "@repo/intent-presets";
import { t } from "elysia";
import { oneOf, PageQuery } from "../http/http.ts";

export const INTENTS = ALL_INTENT_IDS;

export const IntentStatusSchema = oneOf(["pending", "approved", "rejected"]);

/** One message the classifier has learned about, and what a person decided about it. */
export const IntentExample = t.Object({
	id: t.String(),
	channelId: t.String(),
	channelName: t.String(),
	/** The normalized English text: what examples are matched on. */
	textKey: t.String(),
	/** The text as it came, for reading. */
	sample: t.String(),
	intent: t.String(),
	/** Who produced the label: Laya, or an admin's correction. */
	source: t.UnionEnum(["laya", "admin"]),
	status: t.UnionEnum(["pending", "approved", "rejected"]),
	/** `auto` = Laya's confidence cleared the threshold, `admin` = a person; null while pending/rejected. */
	approvedBy: t.Nullable(t.UnionEnum(["auto", "admin"])),
	/** Laya's calibrated probability of the label, when it gave one. */
	confidence: t.Nullable(t.Number()),
	/** The request the label first came from. */
	planRunId: t.Nullable(t.String()),
	seenCount: t.Number(),
	createdAt: t.Number(),
	updatedAt: t.Number(),
});

export const IntentsPage = t.Object({
	items: t.Array(IntentExample),
	total: t.Number(),
});

export const IntentsQuery = t.Composite([
	PageQuery,
	t.Object({
		status: t.Optional(IntentStatusSchema),
		channelId: t.Optional(t.String({ minLength: 1 })),
	}),
]);

/** A verdict: approve/reject, or correct the intent (which approves it). */
export const IntentVerdictBody = t.Object({
	status: t.Optional(IntentStatusSchema),
	intent: t.Optional(oneOf(INTENTS)),
});

export const IntentResult = t.Object({ item: IntentExample });
