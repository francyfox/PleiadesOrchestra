import { REQUEST_HOLD_NANO } from "../ledger/ledger.service.ts";
import type { Emit } from "../webhooks/webhooks.types.ts";

const NANO = 1_000_000_000;

export interface BalanceAlertsDeps {
	/** Balance in nano-USD after the debit. */
	balanceOf: (accountId: string) => number;
	/** Ids of the account's channels (the ones refused once the balance is gone). */
	channelsOf: (accountId: string) => string[];
	emit: Emit;
	/** `balance.low` fires when the balance is below this many TR. */
	lowThresholdTr: number;
}

/**
 * Called after each debit of an account. Each alert fires once per crossing: it
 * stays quiet while the balance remains below its line and re-arms when the balance
 * is back above it (a top-up seen by a later debit).
 * shortcut: "already told" lives in memory, so after a restart an account that is still
 * low is told once more at its next debit; persist it when that matters.
 */
export function createBalanceAlerts(deps: BalanceAlertsDeps) {
	const told = new Map<string, { low: boolean; depleted: boolean }>();
	return {
		check(accountId: string): void {
			const balance = deps.balanceOf(accountId);
			const state = told.get(accountId) ?? { low: false, depleted: false };
			const low = balance < deps.lowThresholdTr * NANO;
			const depleted = balance < REQUEST_HOLD_NANO;
			if (low && !state.low) {
				deps.emit("balance.low", {
					accountId,
					balanceUsd: balance / NANO,
					thresholdUsd: deps.lowThresholdTr,
				});
			}
			if (depleted && !state.depleted) {
				deps.emit("balance.depleted", {
					accountId,
					balanceUsd: balance / NANO,
					channels: deps.channelsOf(accountId),
				});
			}
			told.set(accountId, { low, depleted });
		},
	};
}
