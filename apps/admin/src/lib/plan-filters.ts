import type { PlanStatus } from "#lib/api-types.js";

export const PLAN_STATUSES = [
	"active",
	"canceling",
	"past_due",
	"ended",
] as const satisfies readonly PlanStatus[];

/** `?status=` from the URL: a known plan status, anything else means "all". */
export function parsePlanStatus(value: string | null): PlanStatus | undefined {
	return PLAN_STATUSES.find((status) => status === value);
}
