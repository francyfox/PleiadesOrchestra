import {
	createKitApp,
	hasBearer,
	type Observability,
	onRequestGuard,
} from "@repo/elysia-kit";
import { t } from "elysia";

export interface ServerDeps {
	/** Mirrors `Laya#systemOne` minus the `model`/`usage` envelope fields — see decision-engine.ts. */
	decide: (
		state: unknown,
		questions: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
	apiKey: string;
	observability: Observability;
}

const DecideBody = t.Object({
	state: t.Unknown(),
	questions: t.Record(t.String(), t.Unknown()),
});

/**
 * Builds the Elysia app. Kept separate from index.ts so tests can call
 * `app.handle(request)` directly against a fake `decide`, without loading
 * the real ONNX weights (see decision-engine.ts).
 */
export function createApp(deps: ServerDeps) {
	return createKitApp({
		observability: deps.observability,
		docs: {
			title: "gamma-decision",
			description: "Typed-decision sidecar (Laya).",
			security: "bearer",
		},
	})
		.onRequest(
			onRequestGuard(deps.observability.logger, (request) => {
				const pathname = new URL(request.url).pathname;
				if (pathname === "/health" || pathname.startsWith("/swagger")) return;
				if (!hasBearer(request, deps.apiKey)) {
					return { status: 401, body: "Unauthorized" };
				}
			}),
		)
		.post(
			"/v1/decide",
			async ({ body }) => {
				const answers = await deps.decide(body.state, body.questions);
				return { answers };
			},
			{ body: DecideBody },
		);
}
