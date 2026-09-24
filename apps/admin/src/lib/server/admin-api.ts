import { error, fail } from "@sveltejs/kit";
import {
	OrchestratorError,
	type OrchestratorWriter,
} from "./orchestrator-client";
import { services } from "./services";

/** Orchestrator client acting as the logged-in admin (`X-Admin-Id` on writes). */
export function orchestratorAs(locals: App.Locals): OrchestratorWriter {
	if (!locals.user) error(401, "Not signed in");
	return services().orchestrator.as(locals.user.id);
}

/** For `load`: turns orchestrator failures into SvelteKit error pages. */
export async function orError<T>(promise: Promise<T>): Promise<T> {
	try {
		return await promise;
	} catch (cause) {
		if (cause instanceof OrchestratorError) {
			error(
				cause.status === 404 ? 404 : cause.status === 503 ? 503 : 502,
				cause.message,
			);
		}
		throw cause;
	}
}

/** For form actions: orchestrator failures become `fail()` with a message the page shows. */
export async function orFail<T>(promise: Promise<T>) {
	try {
		return await promise;
	} catch (cause) {
		if (cause instanceof OrchestratorError) {
			return fail(cause.status >= 500 ? 502 : cause.status, {
				message: cause.message,
			});
		}
		throw cause;
	}
}
