import type {
	DecisionAgent,
	DecisionAnswer,
	DecisionQuestion,
} from "./decision-types";

/**
 * Laya answers with softmax(z / T) where T is one shipped temperature per
 * question type and option count (`temperature_by_options` in the checkpoint's
 * `laya_config.json`). The shipped values are over- or under-confident on any
 * given site's data, so one temperature per bucket is refitted offline
 * (`bun run calibrate`, `laya-calibration.ts`) and applied here to the returned
 * probabilities, without the logits: softmax(z / Tnew) is
 * softmax(ln p * Tship / Tnew).
 */
export type LayaBucket = "choice:2" | "choice:3-5" | "choice:6-10" | "noul:2";

/** What the English checkpoint applies (laya_config.json, laya-onnx 0.1.2). */
export const SHIPPED_TEMPERATURES: Record<LayaBucket, number> = {
	"choice:2": 1.9063563346862793,
	"choice:3-5": 1.7601518630981445,
	"choice:6-10": 1.0000158548355103,
	"noul:2": 1.983399510383606,
};

/** Fitted temperatures per bucket; a bucket that is absent keeps its shipped one. */
export type LayaCalibrationTable = Partial<Record<LayaBucket, number>>;

/** Laya rounds probabilities to 4 decimals, so 0 means "below 0.00005", not "impossible". */
const FLOOR = 1e-4;

/** The bucket Laya picks its temperature from; `undefined` for what is not calibrated here (score, 11+ options, 1 option). */
export function layaBucket(question: DecisionQuestion): LayaBucket | undefined {
	if (question.type === "boolean") return "noul:2";
	if (question.type !== "choice") return undefined;
	const options = Object.keys(question.criteria).length;
	if (options < 2 || options > 10) return undefined;
	if (options === 2) return "choice:2";
	return options <= 5 ? "choice:3-5" : "choice:6-10";
}

/** softmax(ln p * shipped / next): the distribution Laya would have returned at temperature `next`. */
export function rescaleProbabilities(
	probabilities: Record<string, number>,
	shipped: number,
	next: number,
): Record<string, number> {
	const keys = Object.keys(probabilities);
	const logits = keys.map(
		(key) =>
			(Math.log(Math.max(probabilities[key] as number, FLOOR)) * shipped) /
			next,
	);
	const top = Math.max(...logits);
	const exps = logits.map((logit) => Math.exp(logit - top));
	const sum = exps.reduce((a, b) => a + b, 0);
	return Object.fromEntries(
		keys.map((key, i) => [key, (exps[i] as number) / sum]),
	);
}

/**
 * One answer at its bucket's fitted temperature. A temperature is monotonic,
 * so the argmax cannot move: `choice` is kept as Laya returned it. A boolean
 * is P(true) of two classes.
 */
export function calibrate(
	answer: DecisionAnswer,
	question: DecisionQuestion,
	table: LayaCalibrationTable,
): DecisionAnswer {
	const bucket = layaBucket(question);
	const next = bucket ? table[bucket] : undefined;
	if (!bucket || next === undefined) return answer;
	const shipped = SHIPPED_TEMPERATURES[bucket];

	if (answer.type === "boolean") {
		const { true: yes } = rescaleProbabilities(
			{ true: answer.probability, false: 1 - answer.probability },
			shipped,
			next,
		);
		return { type: "boolean", probability: yes as number };
	}
	if (answer.type === "choice" && answer.probabilities) {
		return {
			...answer,
			probabilities: rescaleProbabilities(answer.probabilities, shipped, next),
		};
	}
	return answer;
}

/** The decision agent whose probabilities are the refitted ones (confidence you can compare with a threshold). */
export function withCalibration(
	agent: DecisionAgent,
	table: LayaCalibrationTable,
): DecisionAgent {
	return {
		async decide(state, questions) {
			const answers = await agent.decide(state, questions);
			return Object.fromEntries(
				Object.entries(answers).map(([id, answer]) => {
					const question = questions[id];
					return [id, question ? calibrate(answer, question, table) : answer];
				}),
			);
		},
	};
}
