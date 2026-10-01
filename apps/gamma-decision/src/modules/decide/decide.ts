import { Elysia, t } from "elysia";

/** Mirrors `Laya#systemOne` minus the `model`/`usage` envelope fields. */
export type Decide = (
	state: unknown,
	questions: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/** `POST /v1/decide` — typed questions in, typed answers out. */
export function decideRoutes(decide: Decide) {
	return new Elysia().post(
		"/v1/decide",
		async ({ body }) => ({ answers: await decide(body.state, body.questions) }),
		{
			body: t.Object({
				state: t.Unknown(),
				questions: t.Record(t.String(), t.Unknown()),
			}),
		},
	);
}
