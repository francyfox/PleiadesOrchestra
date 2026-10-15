import type {
	Experimental_DecisionModel,
	Experimental_DecisionQuestion,
} from "ai";
import type { LayaEngine } from "./laya.types.ts";

// `ai` does not re-export the V4 spec types; this is the one `doDecide` model of its union.
type DecisionModelV4 = Extract<
	Experimental_DecisionModel,
	{ doDecide: unknown }
>;
type Question = Experimental_DecisionQuestion;
type Answer = Awaited<
	ReturnType<DecisionModelV4["doDecide"]>
>["answers"][string];

type State = Parameters<DecisionModelV4["doDecide"]>[0]["state"];

/**
 * What `@receptron/laya` takes as state, the way `@ai-sdk/typesafe-ai` sends
 * it to a server: a single JSON part is the value itself, anything else is
 * its parts as text, one per line.
 */
function stateValue(state: State): unknown {
	const [only] = state;
	if (state.length === 1 && only?.type === "json") return only.value;
	return state
		.map((part) => {
			if (part.type === "text") return part.text;
			if (part.type === "json") return JSON.stringify(part.value);
			throw new Error(`Laya takes no ${part.type} parts in a state`);
		})
		.join("\n");
}

/** Laya spells the SDK's boolean question `noul` (Jev's name for it). */
const toLaya = (question: Question) =>
	question.type === "boolean" ? { ...question, type: "noul" } : question;

function toAnswer(answer: unknown): Answer {
	const laya = answer as
		| { type: "noul"; noul: number }
		| { type: "choice"; choice: string; probabilities?: Record<string, number> }
		| { type: "score"; score: number; probabilities?: Record<string, number> };
	switch (laya.type) {
		case "noul":
			return { type: "boolean", probability: laya.noul };
		case "choice":
			return {
				type: "choice",
				choice: laya.choice,
				probabilities: laya.probabilities,
			};
		case "score":
			return {
				type: "score",
				score: laya.score,
				probabilities: laya.probabilities,
			};
	}
}

/**
 * An AI SDK decision model over Laya running in this process (no HTTP hop,
 * so the time is inference only): the same `experimental_decide` path the
 * server model (`@ai-sdk/typesafe-ai` → gamma-decision) takes. The weights
 * stay with the caller (`laya` is already loaded).
 */
export function createLayaModel(deps: { laya: LayaEngine }) {
	const model: DecisionModelV4 & { close(): Promise<void> } = {
		specificationVersion: "v4",
		provider: "laya.in-process",
		modelId: "laya",
		supportedQuestionTypes: ["choice", "score", "boolean"],
		async doDecide({ state, questions }) {
			const result = await deps.laya.systemOne(
				stateValue(state),
				Object.fromEntries(
					Object.entries(questions).map(([id, question]) => [
						id,
						toLaya(question),
					]),
				),
			);
			return {
				answers: Object.fromEntries(
					Object.entries(result.answers).map(([id, answer]) => [
						id,
						toAnswer(answer),
					]),
				),
				usage: {
					inputTokens: result.usage.input_tokens,
					outputTokens: result.usage.output_tokens,
				},
				// Laya rounds its probabilities and scores to 4 decimals, so they sum to 1 only that closely.
				rounding: { probabilityDecimals: 4, scoreDecimals: 4 },
				warnings: [],
				response: { modelId: result.model },
			};
		},
		close: () => deps.laya.close(),
	};
	return model;
}
