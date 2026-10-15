import { describe, expect, test } from "bun:test";
import type { DecisionAgent, DecisionAnswer } from "./decision-types";
import {
	calibrate,
	layaBucket,
	rescaleProbabilities,
	withCalibration,
} from "./laya-calibrate";

const choiceQuestion = (n: number) => ({
	type: "choice" as const,
	instructions: "Pick",
	criteria: Object.fromEntries(
		Array.from({ length: n }, (_, i) => [`o${i}`, null]),
	),
});

describe("layaBucket", () => {
	test("maps the option count to Laya's own temperature buckets", () => {
		expect(layaBucket(choiceQuestion(2))).toBe("choice:2");
		expect(layaBucket(choiceQuestion(3))).toBe("choice:3-5");
		expect(layaBucket(choiceQuestion(5))).toBe("choice:3-5");
		expect(layaBucket(choiceQuestion(6))).toBe("choice:6-10");
		expect(layaBucket(choiceQuestion(10))).toBe("choice:6-10");
		// 11+ options run at Laya's 0.1 (saturated); choice rounds keep questions out of it
		expect(layaBucket(choiceQuestion(11))).toBeUndefined();
		expect(layaBucket({ type: "boolean", instructions: "?" })).toBe("noul:2");
	});
});

describe("rescaleProbabilities", () => {
	test("same temperature changes nothing", () => {
		const out = rescaleProbabilities({ a: 0.7, b: 0.3 }, 1.9, 1.9);
		expect(out.a).toBeCloseTo(0.7, 6);
		expect(out.b).toBeCloseTo(0.3, 6);
	});

	test("equals softmax(z / newT) for logits z shipped at oldT", () => {
		const z = { a: 2, b: 0, c: -1 };
		const soft = (t: number) => {
			const e = Object.values(z).map((v) => Math.exp(v / t));
			const sum = e.reduce((s, v) => s + v, 0);
			return e.map((v) => v / sum);
		};
		const shipped = soft(1.76);
		const out = rescaleProbabilities(
			{
				a: shipped[0] as number,
				b: shipped[1] as number,
				c: shipped[2] as number,
			},
			1.76,
			3,
		);
		const want = soft(3);
		expect(out.a).toBeCloseTo(want[0] as number, 6);
		expect(out.b).toBeCloseTo(want[1] as number, 6);
		expect(out.c).toBeCloseTo(want[2] as number, 6);
	});

	test("a higher temperature softens, a lower one sharpens, always sums to 1", () => {
		const soft = rescaleProbabilities({ a: 0.9, b: 0.1 }, 1, 2);
		const sharp = rescaleProbabilities({ a: 0.9, b: 0.1 }, 1, 0.5);
		expect(soft.a as number).toBeLessThan(0.9);
		expect(sharp.a as number).toBeGreaterThan(0.9);
		expect((soft.a as number) + (soft.b as number)).toBeCloseTo(1, 9);
	});

	test("a probability rounded to 0 is floored, not -Infinity", () => {
		const out = rescaleProbabilities({ a: 1, b: 0 }, 1, 2);
		expect(Number.isFinite(out.a)).toBe(true);
		expect(out.b as number).toBeGreaterThan(0);
	});
});

describe("calibrate", () => {
	const table = { "choice:3-5": 3.52, "noul:2": 0.9915 };

	test("choice: temperature ratio applied, choice kept", () => {
		// shipped 1.76 -> 3.52 halves every logit
		const answer: DecisionAnswer = {
			type: "choice",
			choice: "o0",
			probabilities: { o0: 0.8, o1: 0.15, o2: 0.05 },
		};
		const out = calibrate(answer, choiceQuestion(3), table);
		expect(out.type === "choice" && out.choice).toBe("o0");
		const p = out.type === "choice" ? (out.probabilities?.o0 as number) : 0;
		expect(p).toBeLessThan(0.8);
		expect(p).toBeGreaterThan(0.5);
	});

	test("argmax never changes", () => {
		const answer: DecisionAnswer = {
			type: "choice",
			choice: "o2",
			probabilities: { o0: 0.3, o1: 0.2, o2: 0.5 },
		};
		for (const t of [0.2, 1, 5]) {
			const out = calibrate(answer, choiceQuestion(3), { "choice:3-5": t });
			const probs = (out.type === "choice" ? out.probabilities : {}) ?? {};
			const top = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
			expect(top?.[0]).toBe("o2");
			expect(out.type === "choice" && out.choice).toBe("o2");
		}
	});

	test("boolean: P(true) rescaled as two classes (sigmoid of logit * ratio)", () => {
		const out = calibrate(
			{ type: "boolean", probability: 0.9 },
			{ type: "boolean", instructions: "?" },
			{ "noul:2": 1.983399510383606 * 2 },
		);
		// logit(0.9) = 2.197, halved = 1.0986 -> 0.75
		expect(out.type === "boolean" && out.probability).toBeCloseTo(0.75, 3);
	});

	test("a bucket without a fitted temperature keeps the shipped probabilities", () => {
		const answer: DecisionAnswer = {
			type: "choice",
			choice: "o0",
			probabilities: { o0: 0.9, o1: 0.1 },
		};
		expect(calibrate(answer, choiceQuestion(2), {})).toEqual(answer);
	});

	test("an answer without probabilities, and score answers, pass through", () => {
		const bare: DecisionAnswer = { type: "choice", choice: "o0" };
		expect(calibrate(bare, choiceQuestion(3), table)).toEqual(bare);
		const score: DecisionAnswer = { type: "score", score: 0.4 };
		expect(
			calibrate(score, { type: "score", instructions: "?" } as never, table),
		).toEqual(score);
	});
});

describe("withCalibration", () => {
	test("rescales each answer by its own question and forwards the call", async () => {
		const seen: unknown[] = [];
		const inner: DecisionAgent = {
			async decide(state, questions) {
				seen.push([state, Object.keys(questions)]);
				return {
					pick: {
						type: "choice",
						choice: "o0",
						probabilities: { o0: 0.9, o1: 0.1 },
					},
					flag: { type: "boolean", probability: 0.9 },
				};
			},
		};
		const agent = withCalibration(inner, { "choice:2": 4, "noul:2": 4 });
		const out = await agent.decide(
			{ message: "hi" },
			{
				pick: choiceQuestion(2),
				flag: { type: "boolean", instructions: "?" },
			},
		);
		expect(seen).toEqual([[{ message: "hi" }, ["pick", "flag"]]]);
		expect(
			out.pick?.type === "choice" && out.pick.probabilities?.o0,
		).toBeLessThan(0.9);
		expect(out.flag?.type === "boolean" && out.flag.probability).toBeLessThan(
			0.9,
		);
	});
});
