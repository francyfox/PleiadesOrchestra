import { Elysia, t } from "elysia";

export interface ServerDeps {
	/** Mirrors `Laya#systemOne` minus the `model`/`usage` envelope fields — see decision-engine.ts. */
	decide: (
		state: unknown,
		questions: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
	apiKey: string;
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
	return new Elysia()
		.onRequest(({ request, set }) => {
			if (new URL(request.url).pathname === "/health") return;

			if (request.headers.get("authorization") !== `Bearer ${deps.apiKey}`) {
				set.status = 401;
				return "Unauthorized";
			}
		})
		.get("/health", () => "ok")
		.post(
			"/v1/decide",
			async ({ body }) => {
				const answers = await deps.decide(body.state, body.questions);
				return { answers };
			},
			{ body: DecideBody },
		);
}
