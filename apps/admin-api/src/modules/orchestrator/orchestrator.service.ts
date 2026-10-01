import { Elysia } from "elysia";
import type { ApiError } from "../common/common.schema.ts";
import { OrchestratorError } from "./orchestrator.ts";

/** HTTP status the panel sees for an orchestrator failure: 4xx pass through, 5xx become 502/503. */
export function upstreamStatus(cause: OrchestratorError): number {
	if (cause.status === 503) return 503;
	return cause.status >= 500 ? 502 : cause.status;
}

/** Turns an `OrchestratorError` into `{ message }` with a meaningful status instead of a bare 500. */
export const orchestratorErrors = new Elysia({
	name: "admin-api.orchestrator-errors",
})
	.error({ ORCHESTRATOR: OrchestratorError })
	.onError({ as: "global" }, ({ code, error, set }) => {
		if (code !== "ORCHESTRATOR") return;
		set.status = upstreamStatus(error);
		return { message: error.message } satisfies ApiError;
	});
