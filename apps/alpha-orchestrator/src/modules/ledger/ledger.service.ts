import { eq, sql } from "drizzle-orm";
import { creditLedger } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";

/** Ledger unit: 1 TR = 1 USD = 1_000_000 micro-USD, so per-call costs stay integers. */
export const MICRO_USD = 1_000_000;
const MICRO_PER_CENT = MICRO_USD / 100;

export const centsToMicro = (cents: number) => cents * MICRO_PER_CENT;

/** shortcut: rounds to whole micro-USD, so a call under $0.0000005 is free; store nano-USD if that ever adds up. */
export const usdToMicro = (usd: number) => Math.round(usd * MICRO_USD);

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
