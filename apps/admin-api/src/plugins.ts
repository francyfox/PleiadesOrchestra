import { Elysia } from "elysia";
import type { Auth } from "./auth.ts";
import { OrchestratorError } from "./orchestrator/client.ts";
import type { ApiError } from "./schemas/errors.ts";

/**
 * `admin` macro: routes declared with `{ admin: true }` need a valid admin
 * session and get the signed-in account as `admin` in their context.
 */
export function requireAdmin(auth: Auth) {
	return new Elysia({ name: "admin-api.require-admin" }).macro({
		admin: {
			async resolve({ request, status }) {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) return status(401, { error: "unauthorized" });
				return { admin: session.user };
			},
		},
	});
}

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
		return { message: error.message } satisfies typeof ApiError.static;
	});
