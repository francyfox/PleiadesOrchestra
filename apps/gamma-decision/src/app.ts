import {
	createKitApp,
	type Observability,
	onRequestGuard,
} from "@repo/elysia-kit";
import { authorizeRequest } from "./modules/auth/auth.service.ts";
import { type Decide, decideRoutes } from "./modules/decide/decide.ts";

export interface AppDeps {
	decide: Decide;
	apiKey: string;
	observability: Observability;
}

/**
 * Builds the Elysia app. Kept apart from index.ts so tests can call
 * `app.handle(request)` with a fake `decide`, without loading the ONNX weights.
 */
export function createApp(deps: AppDeps) {
	return createKitApp({
		observability: deps.observability,
		docs: {
			title: "gamma-decision",
			description: "Typed-decision sidecar (Laya).",
			security: "bearer",
		},
	})
		.onRequest(
			onRequestGuard(deps.observability.logger, (request) =>
				authorizeRequest(request, deps.apiKey),
			),
		)
		.use(decideRoutes(deps.decide));
}
