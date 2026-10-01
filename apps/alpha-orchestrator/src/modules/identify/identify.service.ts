import { and, eq } from "drizzle-orm";
import {
	llmCalls,
	messages,
	planRuns,
	threads,
	users,
	visitorTokens,
} from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { trimUserHistory } from "../history/history.service.ts";
import type { UserRow } from "../users/users.types.ts";
import { findVisitor } from "../visitors/visitors.service.ts";

export type IdentifyResult =
	| { status: "ok"; userId: string; merged: boolean }
	| { status: "unknown_visitor" }
	| { status: "conflict" };

export interface IdentifyInput {
	channelId: string;
	visitorToken: string;
	externalUserId: string;
	retentionPerUser: number;
	now: number;
}

/**
 * Binds a widget visitor to the site's own account id, called by the site's
 * backend once the visitor logs in.
 *
 * - No identified user with that id yet → the anonymous user is promoted
 *   in place (same id, history and usage untouched).
 * - One exists → everything of the anonymous user moves onto it in one
 *   transaction and the anonymous row is deleted. A block on either side
 *   survives the merge; so does a whitelisting.
 * - Repeating the same call is a no-op returning the same user; a token
 *   already bound to a *different* account is a conflict.
 */
export function identifyVisitor(db: Db, input: IdentifyInput): IdentifyResult {
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

	const target = findIdentifiedUser(db, input.channelId, input.externalUserId);
	if (!target) {
		promoteToIdentified(db, source, input);
		return { status: "ok", userId: source.id, merged: false };
	}

	mergeInto(db, source, target, input);
	return { status: "ok", userId: target.id, merged: true };
}

function findIdentifiedUser(
	db: Db,
	channelId: string,
	externalUserId: string,
): UserRow | undefined {
	return db
		.select()
		.from(users)
		.where(
			and(
				eq(users.channelId, channelId),
				eq(users.externalUserId, externalUserId),
			),
		)
		.get();
}

function promoteToIdentified(db: Db, user: UserRow, input: IdentifyInput) {
	db.update(users)
		.set({
			kind: "identified",
			externalUserId: input.externalUserId,
			lastSeenAt: input.now,
		})
		.where(eq(users.id, user.id))
		.run();
}

/** Re-points everything owned by `fromId` at `toId`. */
function moveOwnership(db: Db, fromId: string, toId: string) {
	const moveTo = { userId: toId };
	db.update(threads).set(moveTo).where(eq(threads.userId, fromId)).run();
	db.update(messages).set(moveTo).where(eq(messages.userId, fromId)).run();
	db.update(planRuns).set(moveTo).where(eq(planRuns.userId, fromId)).run();
	db.update(llmCalls).set(moveTo).where(eq(llmCalls.userId, fromId)).run();
	db.update(visitorTokens)
		.set(moveTo)
		.where(eq(visitorTokens.userId, fromId))
		.run();
}

/** A block on either account wins (the target's first); a whitelisting on either is kept. */
function mergedAccess(source: UserRow, target: UserRow, now: number) {
	const block =
		target.blockedAt !== null || source.blockedAt === null ? target : source;
	const whitelist = target.whitelistedAt !== null ? target : source;
	return {
		blockedAt: block.blockedAt,
		blockedReason: block.blockedReason,
		blockedBy: block.blockedBy,
		whitelistedAt: whitelist.whitelistedAt,
		whitelistedBy: whitelist.whitelistedBy,
		lastSeenAt: Math.max(target.lastSeenAt, source.lastSeenAt, now),
		// The widget visit is the only place an IP is ever seen.
		lastIp: source.lastIp ?? target.lastIp,
	};
}

function mergeInto(
	db: Db,
	source: UserRow,
	target: UserRow,
	input: IdentifyInput,
) {
	db.$client.transaction(() => {
		moveOwnership(db, source.id, target.id);
		db.update(users)
			.set(mergedAccess(source, target, input.now))
			.where(eq(users.id, target.id))
			.run();
		trimUserHistory(db, target.id, input.retentionPerUser);
		// Everything was moved off it, so nothing cascades — delete it outright
		// rather than keep an empty "merged" row.
		db.delete(users).where(eq(users.id, source.id)).run();
	})();
}
