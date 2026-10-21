import { and, eq, sql } from "drizzle-orm";
import type { PolarClient } from "../billing/billing.service.ts";
import { DAY_MS } from "../common/common.service.ts";
import { type AdminDb, schema } from "../database/database.ts";
import type { OrchestratorClient } from "../orchestrator/orchestrator.ts";
import { LEVEL } from "./accounts.schema.ts";

/** Users unseen for this long are deleted. */
export const INACTIVE_DAYS = 180;

/** `last_active_at` is written at most once a day per account. */
export const needsTouch = (
	lastActiveAt: Date | null | undefined,
	now: number,
) => !lastActiveAt || now - lastActiveAt.getTime() >= DAY_MS;

export interface AccountsContext {
	db: AdminDb;
	orchestrator: OrchestratorClient;
	/** Unset (no Polar token): no plan can have been bought through us, so nothing to cancel. */
	polar?: PolarClient;
}

/**
 * Deletes a level-200 account the safe way round: a running Polar plan is
 * revoked first (nobody keeps paying for a deleted account), then its channels
 * (and their visitors' data) go, in the orchestrator. If either call fails it
 * throws and the account stays, so nothing is orphaned; the caller retries.
 * Orders and `llm_calls` stay in the orchestrator (money numbers). Sessions
 * and credentials cascade with the row. `actorId` is who asked (audit).
 * The one place to extend when a user owns more than an account row.
 */
export async function deleteAccount(
	{ db, orchestrator, polar }: AccountsContext,
	id: string,
	actorId: string,
): Promise<void> {
	if (polar) {
		const { subscription } = await orchestrator.getAccountBilling(id);
		if (subscription && subscription.status !== "ended") {
			await polar.revoke(subscription.id);
		}
	}
	await orchestrator.as(actorId).deleteOwnerChannels(id);
	await db
		.delete(schema.user)
		.where(and(eq(schema.user.id, id), eq(schema.user.level, LEVEL.user)));
}

/**
 * Deletes level-200 accounts unseen for `INACTIVE_DAYS`, each through
 * `deleteAccount`. Never-active accounts count from their creation. An account
 * whose channels cannot be deleted (or plan revoked) is kept and reported to `onError`; the next
 * run retries it. Returns how many were deleted.
 */
export async function deleteInactiveUsers(
	ctx: AccountsContext & { onError?: (id: string, cause: unknown) => void },
	now: number,
): Promise<number> {
	const cutoff = now - INACTIVE_DAYS * DAY_MS;
	const stale = await ctx.db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(
			and(
				eq(schema.user.level, LEVEL.user),
				sql`coalesce(${schema.user.lastActiveAt}, ${schema.user.createdAt}) <= ${cutoff}`,
			),
		);
	let deleted = 0;
	for (const { id } of stale) {
		try {
			await deleteAccount(ctx, id, "system:inactivity");
			deleted++;
		} catch (cause) {
			ctx.onError?.(id, cause);
		}
	}
	return deleted;
}

export async function findByEmail(db: AdminDb, email: string) {
	const [row] = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.email, email.trim().toLowerCase()));
	return row ?? null;
}
