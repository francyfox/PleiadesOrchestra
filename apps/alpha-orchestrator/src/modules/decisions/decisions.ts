import type {
	DecisionAgent,
	DecisionQuestion,
	DecisionState,
} from "@repo/core";
import { Elysia } from "elysia";
import { DecisionsBody, DecisionsResult } from "./decisions.schema.ts";

/** `POST /v1/decisions` — typed-decision questions answered by the decision agent (Laya). Questions and answers use the AI SDK's decision shapes: `choice` / `score` / `boolean`. */
export function decisionsRoutes(decisionAgent: DecisionAgent) {
	return new Elysia({ tags: ["Transport"] }).post(
		"/v1/decisions",
		async ({ body }) => {
			// Elysia's body inference collapses `body` to `unknown` here; the
			// runtime schema above is what actually validates it.
			const { state, questions } = body as {
				state: DecisionState;
				questions: Record<string, DecisionQuestion>;
			};
			return { answers: await decisionAgent.decide(state, questions) };
		},
		{
			body: DecisionsBody,
			response: { 200: DecisionsResult },
			detail: {
				summary: "Answer typed decision questions",
				description:
					"Questions are answered by the decision agent (Laya); question and answer shapes are the AI SDK's `choice` / `score` / `boolean`.",
			},
		},
	);
}
