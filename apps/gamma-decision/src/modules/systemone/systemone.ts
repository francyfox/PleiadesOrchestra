import { Elysia, t } from "elysia";

/** Mirrors `Laya#systemOne`: the full `{ model, answers, usage }` envelope. */
export type Decide = (
	state: unknown,
	questions: Record<string, unknown>,
) => Promise<object>;

/**
 * `POST /v1/systemone` — the TypeSafe Jev wire shape, so the AI SDK's
 * `@ai-sdk/typesafe-ai` decision model talks to it unchanged.
 */
export function systemoneRoutes(decide: Decide) {
	return new Elysia().post(
		"/v1/systemone",
		({ body }) => decide(body.state, body.questions),
		{
			body: t.Object({
				model: t.Optional(t.String()),
				state: t.Unknown(),
				questions: t.Record(t.String(), t.Unknown()),
			}),
		},
	);
}
