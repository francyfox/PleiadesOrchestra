import { describe, expect, test } from "bun:test";
import type {
	DecisionAgent,
	DecisionAnswer,
	DecisionQuestion,
} from "../decision-types.ts";
import type { LlmCallRecord } from "../types.ts";
import { createDecisionAction } from "./decision-action.ts";
import type { WorldState } from "./types.ts";

function fakeDecisionAgent(
	answer: DecisionAnswer,
): DecisionAgent & { capturedState?: unknown; capturedQuestions?: unknown } {
	const agent: DecisionAgent & {
		capturedState?: unknown;
		capturedQuestions?: unknown;
	} = {
		async decide(state, questions) {
			agent.capturedState = state;
			agent.capturedQuestions = questions;
			const [key] = Object.keys(questions);
			return key ? { [key]: answer } : {};
		},
	};
	return agent;
}

describe("createDecisionAction", () => {
	test("calls decide() with the action's own name as the question key", async () => {
		const decisionAgent = fakeDecisionAgent({
			type: "noul",
			noul: 0.9,
			rl_agent: { act_probability: 1 },
		});
		const question: DecisionQuestion = {
			type: "noul",
			instructions: "Is this urgent?",
		};

		const action = createDecisionAction({
			name: "checkUrgent",
			cost: 1,
			preconditions: {},
			effects: { urgent: true },
			decisionAgent,
			question,
			toDecisionState: (state) => ({ text: state.userMessage }),
			toEffects: (answer) =>
				answer.type === "noul" ? { urgent: answer.noul >= 0.5 } : {},
		});

		await action.execute({ state: { userMessage: "help now" } });

		expect(decisionAgent.capturedQuestions).toEqual({
			checkUrgent: question,
		});
		expect(decisionAgent.capturedState).toEqual({ text: "help now" });
	});

	test("maps a noul answer through toEffects, thresholding into a boolean fact", async () => {
		const decisionAgent = fakeDecisionAgent({
			type: "noul",
			noul: 0.87,
			rl_agent: { act_probability: 0.99 },
		});

		const action = createDecisionAction({
			name: "checkAmbiguous",
			cost: 1,
			preconditions: {},
			effects: { needsClarification: true },
			decisionAgent,
			question: { type: "noul", instructions: "Is this ambiguous?" },
			toDecisionState: (state) => state,
			toEffects: (answer) =>
				answer.type === "noul"
					? { needsClarification: answer.noul >= 0.5 }
					: {},
		});

		const effects = await action.execute({ state: {} });

		expect(effects).toEqual({ needsClarification: true });
	});

	test("maps a choice answer through toEffects", async () => {
		const decisionAgent = fakeDecisionAgent({
			type: "choice",
			choice: "buy",
			probabilities: { buy: 0.8, browse: 0.2 },
			confidence: 0.8,
			rl_agent: { act_probability: 0.95 },
		});

		const action = createDecisionAction({
			name: "classifyIntent",
			cost: 1,
			preconditions: {},
			effects: { intent: "buy" },
			decisionAgent,
			question: {
				type: "choice",
				instructions: "What does the user want?",
				criteria: ["buy", "browse"],
			},
			toDecisionState: (state) => state,
			toEffects: (answer) =>
				answer.type === "choice" ? { intent: answer.choice } : {},
		});

		const effects = await action.execute({ state: {} });

		expect(effects).toEqual({ intent: "buy" });
	});

	test("returns no effects when decide() doesn't answer this action's question", async () => {
		const decisionAgent: DecisionAgent = {
			async decide() {
				return {};
			},
		};

		const action = createDecisionAction({
			name: "checkAmbiguous",
			cost: 1,
			preconditions: {},
			effects: { needsClarification: true },
			decisionAgent,
			question: { type: "noul", instructions: "Is this ambiguous?" },
			toDecisionState: (state) => state,
			toEffects: (answer) =>
				answer.type === "noul"
					? { needsClarification: answer.noul >= 0.5 }
					: {},
		});

		const effects = await action.execute({ state: {} });

		expect(effects).toEqual({});
	});

	test("carries the static name/cost/preconditions/effects through unchanged", () => {
		const decisionAgent = fakeDecisionAgent({
			type: "noul",
			noul: 0.1,
			rl_agent: { act_probability: 1 },
		});
		const preconditions: Partial<WorldState> = { authenticated: true };
		const effects: Partial<WorldState> = { needsClarification: true };

		const action = createDecisionAction({
			name: "checkAmbiguous",
			cost: 2,
			preconditions,
			effects,
			decisionAgent,
			question: { type: "noul", instructions: "Is this ambiguous?" },
			toDecisionState: (state) => state,
			toEffects: () => ({}),
		});

		expect(action.name).toBe("checkAmbiguous");
		expect(action.cost).toBe(2);
		expect(action.preconditions).toBe(preconditions);
		expect(action.effects).toBe(effects);
	});
	describe("usage recording", () => {
		const question: DecisionQuestion = {
			type: "noul",
			instructions: "Is this urgent?",
		};

		function recordingAction(decisionAgent: DecisionAgent) {
			const calls: LlmCallRecord[] = [];
			const action = createDecisionAction({
				name: "checkUrgent",
				cost: 1,
				preconditions: {},
				effects: { urgent: true },
				decisionAgent,
				question,
				toDecisionState: () => ({}),
				toEffects: () => ({ urgent: true }),
				usageRecorder: { record: (call) => calls.push(call) },
				threadId: (state) => String(state.threadId),
				userId: (state) => String(state.userId),
			});
			return { action, calls };
		}

		test("records a successful decide() as a decision call without tokens", async () => {
			const { action, calls } = recordingAction(
				fakeDecisionAgent({
					type: "noul",
					noul: 0.9,
					rl_agent: { act_probability: 1 },
				}),
			);

			await action.execute({
				state: { threadId: "t1", userId: "u1", planRunId: "run-1" },
			});

			expect(calls).toHaveLength(1);
			expect(calls[0]).toMatchObject({
				kind: "decision",
				threadId: "t1",
				userId: "u1",
				planRunId: "run-1",
				actionName: "checkUrgent",
				provider: "laya",
				ok: true,
			});
			expect(calls[0]?.inputTokens).toBeUndefined();
			expect(calls[0]?.latencyMs).toBeNumber();
		});

		test("records a failed decide() with ok:false and rethrows", async () => {
			const { action, calls } = recordingAction({
				async decide() {
					throw new Error("laya down");
				},
			});

			await expect(
				action.execute({ state: { threadId: "t1", userId: "u1" } }),
			).rejects.toThrow("laya down");

			expect(calls).toHaveLength(1);
			expect(calls[0]).toMatchObject({
				kind: "decision",
				ok: false,
				error: "laya down",
			});
		});
	});
});
