import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { trimUserHistory } from "../db/history-store.ts";
import {
	llmCalls,
	messages,
	planRuns,
	threads,
	users,
	visitorTokens,
} from "../db/schema.ts";
import { findVisitor } from "./visitors.ts";

export type IdentifyResult =
	| { status: "ok"; userId: string; merged: boolean }
	| { status: "unknown_visitor" }
	| { status: "conflict" };

/**
 * Binds a widget visitor to the shop's own account id, called by the shop
 * backend once the customer logs in.
 *
 * - No identified user with that id yet → the anonymous user is promoted
 *   in place (same id, history and usage untouched).
 * - One exists → everything of the anonymous user moves onto it in one
 *   transaction (threads, messages re-trimmed to retention, usage rows,
 *   plan runs, visitor tokens), and the anonymous row is deleted. A block
 *   on either side survives the merge; so does a whitelisting.
 * - Repeating the same call is a no-op returning the same user; a token
 *   already bound to a *different* account is a conflict.
 */
export function identifyVisitor(
	db: Db,
	input: {
		channelId: string;
		visitorToken: string;
		externalUserId: string;
		retentionPerUser: number;
		now: number;
	},
): IdentifyResult {
	const visitor = findVisitor(db, input.visitorToken, input.now);
	if (!visitor || visitor.channelId !== input.channelId) {
		return { status: "unknown_visitor" };
	}
	const source = visitor.user;

	if (source.kind === "identified") {
		return source.externalUserId === input.externalUserId
			? { status: "ok", userId: source.id, merged: false }
			: { status: "conflict" };
	}

	const target = db
		.select()
		.from(users)
		.where(
			and(
				eq(users.channelId, input.channelId),
				eq(users.externalUserId, input.externalUserId),
			),
		)
		.get();

	if (!target) {
		db.update(users)
			.set({
				kind: "identified",
				externalUserId: input.externalUserId,
				lastSeenAt: input.now,
			})
			.where(eq(users.id, source.id))
			.run();
		return { status: "ok", userId: source.id, merged: false };
	}

	db.$client.transaction(() => {
		const moveTo = { userId: target.id };
		db.update(threads).set(moveTo).where(eq(threads.userId, source.id)).run();
		db.update(messages).set(moveTo).where(eq(messages.userId, source.id)).run();
		db.update(planRuns).set(moveTo).where(eq(planRuns.userId, source.id)).run();
		db.update(llmCalls).set(moveTo).where(eq(llmCalls.userId, source.id)).run();
		db.update(visitorTokens)
			.set(moveTo)
			.where(eq(visitorTokens.userId, source.id))
			.run();

		const block =
			target.blockedAt !== null
				? target
				: source.blockedAt !== null
					? source
					: target;
		const whitelist = target.whitelistedAt !== null ? target : source;
		db.update(users)
			.set({
				blockedAt: block.blockedAt,
				blockedReason: block.blockedReason,
				blockedBy: block.blockedBy,
				whitelistedAt: whitelist.whitelistedAt,
				whitelistedBy: whitelist.whitelistedBy,
				lastSeenAt: Math.max(target.lastSeenAt, source.lastSeenAt, input.now),
			})
			.where(eq(users.id, target.id))
			.run();

		trimUserHistory(db, target.id, input.retentionPerUser);
		// Everything was moved off it, so nothing cascades — deleted outright
		// rather than kept as an empty "merged" row.
		db.delete(users).where(eq(users.id, source.id)).run();
	})();

	return { status: "ok", userId: target.id, merged: true };
}
