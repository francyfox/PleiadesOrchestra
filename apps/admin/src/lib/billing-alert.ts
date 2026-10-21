import type { StandingView } from "#lib/api-types.js";

export type StandingAlert = {
	tone: "red" | "yellow";
	key: "renewPlan" | "topUp" | "lowBalance" | "planEnding";
};

/** Which header alert (if any) a user's standing calls for; the warning is only about a standing that is still ok. */
export function standingAlert(standing: StandingView): StandingAlert | null {
	if (!standing.ok) {
		return {
			tone: "red",
			key: standing.reason === "no_balance" ? "topUp" : "renewPlan",
		};
	}
	if (!standing.warn) return null;
	// `warn` is "balance < 1 TR or plan ends within 3 days"; the balance tells which.
	return {
		tone: "yellow",
		key: standing.balanceUsd < 1 ? "lowBalance" : "planEnding",
	};
}
