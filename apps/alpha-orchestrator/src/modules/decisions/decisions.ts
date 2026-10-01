import type { DecisionAgent, DecisionQuestion } from "@repo/core";
import { Elysia, t } from "elysia";

const DecisionsBody = t.Object({
	state: t.Unknown(),
	questions: t.Record(t.String(), t.Unknown()),
});

/** `POST /v1/decisions` — typed-decision questions answered by the decision agent (Laya). */
export function decisionsRoutes(decisionAgent: DecisionAgent) {
	return new Elysia().post(
		"/v1/decisions",
		async ({ body }) => {
			// Elysia's body inference collapses `body` to `unknown` here; the
			// runtime schema above is what actually validates it.
			const { state, questions } = body as {
				state: unknown;
				questions: Record<string, DecisionQuestion>;
			};
			return { answers: await decisionAgent.decide(state, questions) };
		},
		{ body: DecisionsBody },
	);
}
