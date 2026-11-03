/** The subscription fields standing depends on. */
export interface PlanFields {
	status: string;
	currentPeriodEnd: number | null;
	/** Set by a revoke (Polar `ended_at`): access ends then, before the paid period does. */
	endedAt?: number | null;
}

export type Standing =
	| {
			ok: true;
			/** The plan holds only until this time (a canceled/past_due plan's paid period); `null` = until a webhook says otherwise. Cache and compare with `now`. */
			until: number | null;
	  }
	| {
			ok: false;
			reason: "no_plan" | "plan_expired" | "no_balance";
			/** When the plan ended (`plan_expired`); `null` when unknown. */
			since: number | null;
	  };

import { REQUEST_HOLD_MICRO } from "../ledger/ledger.service.ts";

/**
 * Whether an account's channels may serve: a balance (micro-USD) that covers at
 * least one request hold (`REQUEST_HOLD_MICRO`). The plan only tops the balance up, so what is
 * left keeps working after it ends. At zero the reason says what to do: no plan
 * yet, a plan that ended (Polar `ended_at` on a revoke, else the period end), or
 * a running plan whose month is used up. `until` stays for callers; always `null`.
 */
export function accountStanding(
	plan: PlanFields | null,
	balance: number,
	now: number,
): Standing {
	if (balance >= REQUEST_HOLD_MICRO) return { ok: true, until: null };
	if (!plan) return { ok: false, reason: "no_plan", since: null };
	const running = plan.status === "active" || plan.status === "trialing";
	const end = plan.endedAt ?? plan.currentPeriodEnd;
	if (!running && !(end !== null && now < end))
		return { ok: false, reason: "plan_expired", since: end };
	return { ok: false, reason: "no_balance", since: null };
}
