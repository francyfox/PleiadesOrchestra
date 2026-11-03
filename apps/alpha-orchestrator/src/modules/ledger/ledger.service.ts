import { eq, sql } from "drizzle-orm";
import { creditLedger } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";

/** Ledger unit: 1 TR = 1 USD = 1_000_000 micro-USD, so per-call costs stay integers. */
export const MICRO_USD = 1_000_000;
const MICRO_PER_CENT = MICRO_USD / 100;

export const centsToMicro = (cents: number) => cents * MICRO_PER_CENT;

/** A debit in whole micro-USD, rounded up (a cheap call is never free); `1e-6` absorbs float noise like 0.3 * 1e6. */
export const usdToMicro = (usd: number) =>
	usd > 0 ? Math.ceil(usd * MICRO_USD - 1e-6) : 0;

/**
 * What one request holds while it runs (reserve-then-settle): a request starts
 * only when the balance minus the holds in flight covers it, and the hold goes
 * when its stream ends, after the usage is debited. Also the least balance that
 * counts as running. shortcut: one fixed 0.05 TR for every request; derive it
 * from recent request costs per channel when a request can cost more.
 */
export const REQUEST_HOLD_MICRO = 50_000;

/** Balance in micro-USD; negative = overdraft carried to the next top-up. */
export function balanceMicro(db: Db, accountId: string): number {
	return (
		db
			.select({ total: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)` })
			.from(creditLedger)
			.where(eq(creditLedger.accountId, accountId))
			.get()?.total ?? 0
	);
}
