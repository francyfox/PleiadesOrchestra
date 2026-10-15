import { describe, expect, test } from "bun:test";
import { createLayaModel } from "./laya.model.ts";
import type { LayaEngine } from "./laya.types.ts";

function fakeLaya(answers: Record<string, unknown>) {
	const calls: { state: unknown; questions: Record<string, unknown> }[] = [];
	let closed = false;
	const engine: LayaEngine = {
		async systemOne(state, questions) {
			calls.push({ state, questions });
			return {
				model: "laya-test",
				answers,
				usage: { input_tokens: 12, output_tokens: 3 },
			};
		},
		async close() {
			closed = true;
		},
	};
	return { engine, calls, closed: () => closed };
}

describe("createLayaModel", () => {
	test("a boolean question goes to Laya as noul and comes back as a probability", async () => {
		const { engine, calls } = fakeLaya({
			bag: { type: "noul", noul: 0.8, rl_agent: { act_probability: 1 } },
		});
		const model = createLayaModel({ laya: engine });
		const result = await model.doDecide({
			state: [{ type: "json", value: { message: "a bag please" } }],
			questions: {
				bag: {
					type: "boolean",
					instructions: "Wants a bag?",
					criteria: { true: "yes" },
				},
			},
		});
		expect(calls[0]?.questions).toEqual({
			bag: {
				type: "noul",
				instructions: "Wants a bag?",
				criteria: { true: "yes" },
			},
		});
		expect(result.answers).toEqual({
			bag: { type: "boolean", probability: 0.8 },
		});
		expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
		expect(result.response?.modelId).toBe("laya-test");
		expect(result.rounding).toEqual({
			probabilityDecimals: 4,
			scoreDecimals: 4,
		});
		expect(result.warnings).toEqual([]);
	});

	test("choice and score keep their probabilities, nothing else of Laya's answer leaks", async () => {
		const { engine } = fakeLaya({
			cabin: {
				type: "choice",
				choice: "business",
				probabilities: { economy: 0.25, business: 0.75 },
				confidence: 0.4,
				rl_agent: { act_probability: 1 },
			},
			mood: {
				type: "score",
				score: 1.5,
				probabilities: { "0": 0.25, "1": 0.25, "2": 0.5 },
				legend: { "0": "low" },
				confidence: 0.1,
				rl_agent: { act_probability: 1 },
			},
		});
		const result = await createLayaModel({ laya: engine }).doDecide({
			state: [{ type: "text", text: "x" }],
			questions: {
				cabin: {
					type: "choice",
					instructions: "Which cabin?",
					criteria: { economy: null, business: null },
				},
				mood: {
					type: "score",
					instructions: "How happy?",
					criteria: ["low", "mid", "high"],
				},
			},
		});
		expect(result.answers).toEqual({
			cabin: {
				type: "choice",
				choice: "business",
				probabilities: { economy: 0.25, business: 0.75 },
			},
			mood: {
				type: "score",
				score: 1.5,
				probabilities: { "0": 0.25, "1": 0.25, "2": 0.5 },
			},
		});
	});

	test("state: a single JSON part is the value itself, text and JSON parts are joined by lines", async () => {
		const { engine, calls } = fakeLaya({});
		const model = createLayaModel({ laya: engine });
		const questions = {};
		await model.doDecide({
			state: [{ type: "json", value: { message: "hi" } }],
			questions,
		});
		await model.doDecide({
			state: [
				{ type: "text", text: "Safe route: yes." },
				{ type: "json", value: [1, 2] },
				{ type: "text", text: "Food: no." },
			],
			questions,
		});
		expect(calls.map((call) => call.state)).toEqual([
			{ message: "hi" },
			"Safe route: yes.\n[1,2]\nFood: no.",
		]);
	});

	test("close() closes the engine; it announces the question types Laya has", async () => {
		const { engine, closed } = fakeLaya({});
		const model = createLayaModel({ laya: engine });
		expect([...model.supportedQuestionTypes].sort()).toEqual([
			"boolean",
			"choice",
			"score",
		]);
		expect(model.specificationVersion).toBe("v4");
		await model.close();
		expect(closed()).toBe(true);
	});
});
