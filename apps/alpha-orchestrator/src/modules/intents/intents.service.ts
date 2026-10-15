import {
	createIntentModel,
	type IntentExample,
	type IntentHit,
	type IntentModel,
	type MessageIntent,
	NEEDS_THE_WORDS,
	normalizeIntentText,
} from "@repo/core";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { channels, intentExamples } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { limitOffset, type PageParams } from "../http/http.service.ts";

export type IntentStatus = "pending" | "approved" | "rejected";

/**
 * Keeps what Laya said about a message. By default it waits as `pending` for a
 * person to judge. When Laya's calibrated `confidence` reaches `autoApproveAt`
 * the label is approved on its own (`approvedBy: "auto"`) and the site's memory
 * learns from it - except the intents only a person's own words may decide
 * (`NEEDS_THE_WORDS`: checkout, removal), which are never approved by a model.
 * A text that is already there only counts: it never changes a label or a
 * verdict, so an admin's decision can't be overwritten by the same guess
 * coming back. Returns whether the row was approved automatically (the
 * caller then rebuilds the channel's memory).
 */
export function learnIntent(
	db: Db,
	input: {
		channelId: string;
		/** The English text the intent was decided on. */
		text: string;
		intent: MessageIntent;
		planRunId: string | null;
		now: number;
		/** Laya's (calibrated) probability of `intent`. */
		confidence?: number;
		/** Auto-approve from this confidence up; unset = always wait for a person. */
		autoApproveAt?: number;
	},
): boolean {
	const textKey = normalizeIntentText(input.text);
	if (textKey === "") return false;
	const auto =
		input.autoApproveAt !== undefined &&
		input.confidence !== undefined &&
		input.confidence >= input.autoApproveAt &&
		!NEEDS_THE_WORDS.has(input.intent);
	db.insert(intentExamples)
		.values({
			id: crypto.randomUUID(),
			channelId: input.channelId,
			textKey,
			sample: input.text.slice(0, 500),
			intent: input.intent,
			source: "laya",
			status: auto ? "approved" : "pending",
			approvedBy: auto ? "auto" : null,
			confidence: input.confidence ?? null,
			planRunId: input.planRunId,
			createdAt: input.now,
			updatedAt: input.now,
		})
		.onConflictDoUpdate({
			target: [intentExamples.channelId, intentExamples.textKey],
			set: { seenCount: sql`${intentExamples.seenCount} + 1` },
		})
		.run();
	return auto;
}

/** What the channel's classifier is built from: approved examples, oldest first (a later one wins). */
export function approvedExamples(db: Db, channelId: string): IntentExample[] {
	return db
		.select({ text: intentExamples.textKey, intent: intentExamples.intent })
		.from(intentExamples)
		.where(
			and(
				eq(intentExamples.channelId, channelId),
				eq(intentExamples.status, "approved"),
			),
		)
		.orderBy(asc(intentExamples.updatedAt), asc(intentExamples.createdAt))
		.all()
		.map((row) => ({ text: row.text, intent: row.intent as MessageIntent }));
}

export interface IntentListQuery extends PageParams {
	status?: IntentStatus;
	channelId?: string;
}

/** A row as the admin sees it: the example and its channel's name. Shared by the list and by a verdict's answer. */
const exampleColumns = {
	id: intentExamples.id,
	channelId: intentExamples.channelId,
	channelName: channels.name,
	textKey: intentExamples.textKey,
	sample: intentExamples.sample,
	intent: intentExamples.intent,
	source: intentExamples.source,
	status: intentExamples.status,
	approvedBy: intentExamples.approvedBy,
	confidence: intentExamples.confidence,
	planRunId: intentExamples.planRunId,
	seenCount: intentExamples.seenCount,
	createdAt: intentExamples.createdAt,
	updatedAt: intentExamples.updatedAt,
};

/** Newest activity first, with the channel's name. */
export function listIntentExamples(db: Db, query: IntentListQuery) {
	const where = and(
		query.status ? eq(intentExamples.status, query.status) : undefined,
		query.channelId ? eq(intentExamples.channelId, query.channelId) : undefined,
	);
	const { limit, offset } = limitOffset(query);
	const select = db
		.select(exampleColumns)
		.from(intentExamples)
		.innerJoin(channels, eq(channels.id, intentExamples.channelId))
		.where(where)
		.orderBy(desc(intentExamples.updatedAt), desc(intentExamples.createdAt));
	const items =
		limit === undefined
			? select.all()
			: select
					.limit(limit)
					.offset(offset ?? 0)
					.all();
	const total =
		db.select({ value: count() }).from(intentExamples).where(where).get()
			?.value ?? 0;
	return { items, total };
}

/**
 * A person's verdict: approve, reject, or correct (a new intent is the
 * person's label and is approved with it). `undefined` for an unknown id.
 */
export function judgeIntentExample(
	db: Db,
	id: string,
	verdict: { status?: IntentStatus; intent?: MessageIntent },
	now: number,
) {
	const current = db
		.select()
		.from(intentExamples)
		.where(eq(intentExamples.id, id))
		.get();
	if (!current) return undefined;
	const corrected =
		verdict.intent !== undefined && verdict.intent !== current.intent;
	const status = verdict.status ?? (corrected ? "approved" : current.status);
	db.update(intentExamples)
		.set({
			intent: verdict.intent ?? current.intent,
			source: verdict.intent !== undefined ? "admin" : current.source,
			status,
			// A person's verdict replaces the automatic mark; a row that is not approved has no approver.
			approvedBy: status === "approved" ? "admin" : null,
			updatedAt: now,
		})
		.where(eq(intentExamples.id, id))
		.run();
	return db
		.select(exampleColumns)
		.from(intentExamples)
		.innerJoin(channels, eq(channels.id, intentExamples.channelId))
		.where(eq(intentExamples.id, id))
		.get();
}

/**
 * One classifier per channel, built from its approved examples and kept until
 * a verdict changes them (`invalidate`). A new site has no examples: its model
 * answers nothing and Laya is asked, until a person approves the first ones.
 */
export class IntentMemory {
	private readonly models = new Map<string, IntentModel>();

	constructor(private readonly db: Db) {}

	classify(channelId: string, text: string): IntentHit | undefined {
		let model = this.models.get(channelId);
		if (!model) {
			model = createIntentModel(approvedExamples(this.db, channelId));
			this.models.set(channelId, model);
		}
		return model.classify(text);
	}

	invalidate(channelId: string): void {
		this.models.delete(channelId);
	}
}
