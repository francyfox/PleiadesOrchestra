import { addUtcDays } from "../common/common.service.ts";
import type { FetchContext } from "../common/common.types.ts";
import type { PerformanceReport } from "./performance.schema.ts";

/** `GET /api/performance`: latency percentiles, by default over the last 30 days. */
export function fetchPerformance(
	{ orchestrator, now }: Pick<FetchContext, "orchestrator" | "now">,
	query: { from?: number },
): Promise<PerformanceReport> {
	return orchestrator.performance({
		from: query.from ?? addUtcDays(now(), -30),
	});
}
