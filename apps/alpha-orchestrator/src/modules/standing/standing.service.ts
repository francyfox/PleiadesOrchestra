/** The subscription fields standing depends on. */
export interface PlanFields {
	status: string;
	currentPeriodEnd: number | null;
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

/**
 * Whether an account's channels may serve: a plan in effect (Polar `active` /
 * `trialing`, or any status while `now < current_period_end`) and a balance
 * above zero (any unit; the sign is all that matters).
 */
export function accountStanding(
	plan: PlanFields | null,
	balance: number,
	now: number,
): Standing {
	if (!plan) return { ok: false, reason: "no_plan", since: null };
	const running = plan.status === "active" || plan.status === "trialing";
	const inPeriod =
		plan.currentPeriodEnd !== null && now < plan.currentPeriodEnd;
	if (!running && !inPeriod)
		return { ok: false, reason: "plan_expired", since: plan.currentPeriodEnd };
	if (balance <= 0) return { ok: false, reason: "no_balance", since: null };
	return { ok: true, until: running ? null : plan.currentPeriodEnd };
}
