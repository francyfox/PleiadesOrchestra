import {
	type LayaBucket,
	layaBucket,
	SHIPPED_TEMPERATURES,
} from "#core/laya-calibrate";

/** One asked question with a known right answer: Laya's shipped probabilities and the index of the right option. */
export interface LayaSample {
	bucket: LayaBucket;
	/** Probabilities as returned, in a fixed option order; a boolean is `[P(true), 1 - P(true)]`. */
	probs: number[];
	/** Index of the right option in `probs`. */
	label: number;
	/** Temperature the probabilities were shipped at; default: the bucket's. */
	shipped?: number;
}

const FLOOR = 1e-4;

const shippedOf = (sample: LayaSample) =>
	sample.shipped ?? SHIPPED_TEMPERATURES[sample.bucket];

/** The probabilities at temperature `t`. */
export function atTemperature(sample: LayaSample, t: number): number[] {
	const ratio = shippedOf(sample) / t;
	const logits = sample.probs.map((p) => Math.log(Math.max(p, FLOOR)) * ratio);
	const top = Math.max(...logits);
	const exps = logits.map((l) => Math.exp(l - top));
	const sum = exps.reduce((a, b) => a + b, 0);
	return exps.map((e) => e / sum);
}

function nll(samples: LayaSample[], t: number): number {
	let total = 0;
	for (const sample of samples) {
		total -= Math.log(
			Math.max(atTemperature(sample, t)[sample.label] as number, 1e-12),
		);
	}
	return total / samples.length;
}

/** The temperature minimising the negative log-likelihood: golden-section search on log T (the NLL is unimodal there). */
export function fitTemperature(samples: LayaSample[]): number {
	const phi = (Math.sqrt(5) - 1) / 2;
	let low = Math.log(0.05);
	let high = Math.log(20);
	let a = high - phi * (high - low);
	let b = low + phi * (high - low);
	let fa = nll(samples, Math.exp(a));
	let fb = nll(samples, Math.exp(b));
	for (let i = 0; i < 80; i++) {
		if (fa < fb) {
			high = b;
			b = a;
			fb = fa;
			a = high - phi * (high - low);
			fa = nll(samples, Math.exp(a));
		} else {
			low = a;
			a = b;
			fa = fb;
			b = low + phi * (high - low);
			fb = nll(samples, Math.exp(b));
		}
	}
	return Math.exp((low + high) / 2);
}

export interface Prediction {
	confidence: number;
	correct: boolean;
}

/** Mean |accuracy - confidence| over equal-width bins, weighted by bin size. */
export function expectedCalibrationError(
	predictions: Prediction[],
	bins = 10,
): number {
	if (predictions.length === 0) return 0;
	const sums = Array.from({ length: bins }, () => ({
		n: 0,
		confidence: 0,
		right: 0,
	}));
	for (const { confidence, correct } of predictions) {
		const bin = sums[Math.min(bins - 1, Math.floor(confidence * bins))];
		if (!bin) continue;
		bin.n++;
		bin.confidence += confidence;
		bin.right += correct ? 1 : 0;
	}
	return sums.reduce(
		(total, bin) =>
			bin.n === 0
				? total
				: total + Math.abs(bin.right - bin.confidence) / predictions.length,
		0,
	);
}

function predict(sample: LayaSample, t: number): Prediction {
	const probs = atTemperature(sample, t);
	const top = Math.max(...probs);
	return { confidence: top, correct: probs.indexOf(top) === sample.label };
}

const mean = (values: number[]) =>
	values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

export interface CalibrationReport {
	n: number;
	accuracy: number;
	/** Temperature fitted on all the data (what gets committed). */
	temperature: number;
	shippedTemperature: number;
	/** Shipped temperature, all data. */
	eceBefore: number;
	meanConfidenceBefore: number;
	/** Held-out: every sample is scored with a temperature fitted on the other folds. */
	eceAfter: number;
	meanConfidenceAfter: number;
	/** Held-out answers whose calibrated confidence reached the threshold. */
	autoApprove: { threshold: number; count: number; right: number };
	/** The same at the shipped temperature, for comparison. */
	autoApproveBefore: { count: number; right: number };
}

/** Deterministic shuffle (the same data always folds the same way). */
function shuffled<T>(items: T[]): T[] {
	const out = [...items];
	let seed = 12345;
	for (let i = out.length - 1; i > 0; i--) {
		seed = (seed * 1664525 + 1013904223) % 4294967296;
		const j = seed % (i + 1);
		[out[i], out[j]] = [out[j] as T, out[i] as T];
	}
	return out;
}

/**
 * k-fold: each fold is scored with a temperature fitted on the rest, so the
 * ECE and the auto-approve numbers are held-out (the data set is small).
 */
export function crossValidate(
	samples: LayaSample[],
	folds = 5,
	threshold = 0.85,
): CalibrationReport {
	const order = shuffled(samples);
	const held: Prediction[] = [];
	for (let fold = 0; fold < folds; fold++) {
		const test = order.filter((_, i) => i % folds === fold);
		const train = order.filter((_, i) => i % folds !== fold);
		if (train.length === 0) continue;
		const t = fitTemperature(train);
		for (const sample of test) held.push(predict(sample, t));
	}
	const before = samples.map((sample) => predict(sample, shippedOf(sample)));
	const sure = (items: Prediction[]) =>
		items.filter((p) => p.confidence >= threshold);
	const bucket = samples[0]?.bucket;
	return {
		n: samples.length,
		accuracy: mean(before.map((p) => (p.correct ? 1 : 0))),
		temperature: fitTemperature(samples),
		shippedTemperature: bucket ? SHIPPED_TEMPERATURES[bucket] : 1,
		eceBefore: expectedCalibrationError(before),
		meanConfidenceBefore: mean(before.map((p) => p.confidence)),
		eceAfter: expectedCalibrationError(held),
		meanConfidenceAfter: mean(held.map((p) => p.confidence)),
		autoApprove: {
			threshold,
			count: sure(held).length,
			right: sure(held).filter((p) => p.correct).length,
		},
		autoApproveBefore: {
			count: sure(before).length,
			right: sure(before).filter((p) => p.correct).length,
		},
	};
}

/**
 * One labelled Laya answer, as saved by the collectors in `eval/` and
 * `apps/benchmark` (`bun laya --samples`): raw probabilities as the server
 * returned them, so fitting is offline.
 */
export interface LayaRecord {
	kind: "choice" | "boolean";
	/** Where the case comes from (a case set, a benchmark domain). */
	source: string;
	/** The text asked about, for reading the misses. */
	text: string;
	/** Choice: every option, in the order asked. Boolean: absent. */
	options?: string[];
	/** Choice: option -> probability. */
	probabilities?: Record<string, number>;
	/** Boolean: P(true). */
	probability?: number;
	/** Choice: the right option. Boolean: the right truth value. */
	label: string | boolean;
}

export interface LayaRecordFile {
	at: string;
	records: LayaRecord[];
}

/**
 * A record as a fit sample, `undefined` when it cannot be scored: a label that
 * is not one of the options, or a question outside the calibrated buckets.
 */
export function recordToSample(record: LayaRecord): LayaSample | undefined {
	if (record.kind === "boolean") {
		if (record.probability === undefined) return undefined;
		return {
			bucket: "noul:2",
			probs: [record.probability, 1 - record.probability],
			label: record.label === true ? 0 : 1,
		};
	}
	const options = record.options ?? [];
	const bucket = layaBucket({
		type: "choice",
		instructions: "",
		criteria: Object.fromEntries(options.map((option) => [option, null])),
	});
	const label = options.indexOf(String(record.label));
	if (!bucket || label < 0 || !record.probabilities) return undefined;
	return {
		bucket,
		probs: options.map((option) => record.probabilities?.[option] ?? 0),
		label,
	};
}
