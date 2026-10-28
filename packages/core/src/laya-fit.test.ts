import { describe, expect, test } from "bun:test";
import {
	crossValidate,
	expectedCalibrationError,
	fitTemperature,
	type LayaSample,
	recordToSample,
} from "#core/laya-fit";

/** Deterministic pseudo-random numbers so the synthetic data never flakes. */
function rng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

/**
 * Samples whose TRUE temperature is `trueT`: logits are drawn, the label is
 * drawn from softmax(z / trueT), and Laya "ships" softmax(z / shippedT).
 */
function synthetic(
	n: number,
	options: number,
	trueT: number,
	shippedT: number,
	seed = 7,
): LayaSample[] {
	const rand = rng(seed);
	const soft = (z: number[], t: number) => {
		const e = z.map((v) => Math.exp(v / t));
		const sum = e.reduce((a, b) => a + b, 0);
		return e.map((v) => v / sum);
	};
	return Array.from({ length: n }, () => {
		const z = Array.from({ length: options }, () => (rand() - 0.5) * 8);
		const truth = soft(z, trueT);
		let r = rand();
		let label = options - 1;
		for (let i = 0; i < options; i++) {
			r -= truth[i] as number;
			if (r <= 0) {
				label = i;
				break;
			}
		}
		return {
			bucket: "choice:3-5",
			probs: soft(z, shippedT),
			label,
			shipped: shippedT,
		};
	});
}

describe("fitTemperature", () => {
	test("recovers the temperature the labels were drawn from", () => {
		const samples = synthetic(4000, 4, 2.5, 1);
		expect(fitTemperature(samples)).toBeCloseTo(2.5, 0);
	});

	test("an over-confident model is cooled, an under-confident one sharpened", () => {
		expect(fitTemperature(synthetic(3000, 4, 3, 1, 3))).toBeGreaterThan(1.5);
		expect(fitTemperature(synthetic(3000, 4, 0.5, 1, 4))).toBeLessThan(0.8);
	});
});

describe("expectedCalibrationError", () => {
	test("perfectly calibrated confidences give 0", () => {
		const bins = [
			...Array.from({ length: 10 }, (_, i) => ({
				confidence: 0.9,
				correct: i < 9,
			})),
		];
		expect(expectedCalibrationError(bins)).toBeCloseTo(0, 9);
	});

	test("always 100% sure but half right is 0.5", () => {
		const items = Array.from({ length: 10 }, (_, i) => ({
			confidence: 1,
			correct: i < 5,
		}));
		expect(expectedCalibrationError(items)).toBeCloseTo(0.5, 9);
	});
});

describe("crossValidate", () => {
	test("held-out ECE of the refit beats the shipped one", () => {
		const samples = synthetic(600, 4, 3, 1, 11);
		const report = crossValidate(samples, 5);
		expect(report.n).toBe(600);
		expect(report.eceAfter).toBeLessThan(report.eceBefore);
		expect(report.meanConfidenceAfter).toBeLessThan(
			report.meanConfidenceBefore,
		);
		expect(report.temperature).toBeCloseTo(3, 0);
	});

	test("reports how many answers clear the threshold and how many of those are right", () => {
		const samples = synthetic(600, 4, 1, 1, 5);
		const report = crossValidate(samples, 5, 0.85);
		expect(report.autoApprove.count).toBeGreaterThan(0);
		expect(report.autoApprove.right).toBeLessThanOrEqual(
			report.autoApprove.count,
		);
		expect(report.autoApprove.count).toBeLessThanOrEqual(report.n);
	});
});

describe("recordToSample", () => {
	test("a choice record gets its bucket from the option count and the label's index", () => {
		const sample = recordToSample({
			kind: "choice",
			source: "x",
			text: "t",
			options: ["a", "b", "c"],
			probabilities: { a: 0.2, b: 0.7, c: 0.1 },
			label: "b",
		});
		expect(sample).toEqual({
			bucket: "choice:3-5",
			probs: [0.2, 0.7, 0.1],
			label: 1,
		});
	});

	test("a boolean record is two classes, index 0 = true", () => {
		const sample = recordToSample({
			kind: "boolean",
			source: "x",
			text: "t",
			probability: 0.8,
			label: false,
		});
		expect(sample?.bucket).toBe("noul:2");
		expect(sample?.label).toBe(1);
		expect(sample?.probs[0]).toBe(0.8);
		expect(sample?.probs[1]).toBeCloseTo(0.2, 9);
	});

	test("a label outside the options is skipped", () => {
		expect(
			recordToSample({
				kind: "choice",
				source: "x",
				text: "t",
				options: ["a", "b"],
				probabilities: { a: 0.5, b: 0.5 },
				label: "z",
			}),
		).toBeUndefined();
	});
});
