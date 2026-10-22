import { type Static, t } from "elysia";
import { IntentStatus, IntentVerdictInput } from "../../forms/forms.ts";
import { nullable, PageQuery } from "../common/common.schema.ts";

export { IntentVerdictInput };

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
	/** Who put it into the model: `auto` = Laya's confidence cleared the threshold, `admin` = a person; null while pending/rejected. */
	approvedBy: nullable(t.UnionEnum(["auto", "admin"])),
	/** Laya's calibrated probability of the label, when it gave one. */
	confidence: nullable(t.Number()),
	/** The request the label first came from (opens its graph). */
	planRunId: nullable(t.String()),
	seenCount: t.Number(),
	createdAt: t.Number(),
	updatedAt: t.Number(),
});

export const IntentsPage = t.Object({
	items: t.Array(IntentExample),
	total: t.Number(),
});

/** Paging plus optional filters; an omitted filter means "all". */
export const IntentsQuery = t.Composite([
	PageQuery,
	t.Object({
		status: t.Optional(IntentStatus),
		channelId: t.Optional(t.String({ minLength: 1 })),
	}),
]);

export type IntentExample = Static<typeof IntentExample>;
export type IntentsPage = Static<typeof IntentsPage>;
export type IntentsQuery = Static<typeof IntentsQuery>;
