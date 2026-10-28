/**
 * Refits Laya's temperature, one per (question type x option-count bucket),
 * from the raw probabilities in `eval/data/laya-*.json` (collected by
 * `eval/collect-intents.ts` and `bun laya --samples` in apps/benchmark), and
 * writes the table to `src/laya-calibration.ts`.
 *   bun run calibrate [--threshold 0.85] [--folds 5] [--dry]
 * Held-out numbers only (k-fold). A bucket with fewer than MIN_SAMPLES keeps
 * the shipped temperature, and so does one whose refit does not lower the
 * held-out ECE.
 */

import { readdirSync } from "node:fs";
import type { LayaBucket, LayaCalibrationTable } from "#core/laya-calibrate";
import {
	type CalibrationReport,
	crossValidate,
	type LayaRecordFile,
	type LayaSample,
	recordToSample,
} from "#core/laya-fit";

const MIN_SAMPLES = 30;
const flag = (name: string, fallback: number) => {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? Number(process.argv[at + 1]) : fallback;
};
const threshold = flag("threshold", 0.85);
const folds = flag("folds", 5);

const dataDir = new URL("./data/", import.meta.url).pathname;
const files = readdirSync(dataDir).filter(
	(name) => name.startsWith("laya-") && name.endsWith(".json"),
);
const byBucket = new Map<LayaBucket, LayaSample[]>();
let newest = "";
let skipped = 0;
for (const name of files) {
	const file = (await Bun.file(`${dataDir}${name}`).json()) as LayaRecordFile;
	if (file.at > newest) newest = file.at;
	for (const record of file.records) {
		const sample = recordToSample(record);
		if (!sample) {
			skipped++;
			continue;
		}
		byBucket.set(sample.bucket, [
			...(byBucket.get(sample.bucket) ?? []),
			sample,
		]);
	}
}

const pct = (value: number) => `${(100 * value).toFixed(0)}%`;
const table: LayaCalibrationTable = {};
const sizes: Partial<Record<LayaBucket, number>> = {};
console.log(
	`data: ${files.join(", ")} (${skipped} records skipped); threshold ${threshold}, ${folds}-fold held-out\n`,
);
console.log(
	"bucket        n   acc   T ship -> fit   ECE before -> after   conf before -> after   >=thr: shipped n/right -> calibrated n/right",
);
for (const bucket of [
	"choice:2",
	"choice:3-5",
	"choice:6-10",
	"noul:2",
] as const) {
	const samples = byBucket.get(bucket) ?? [];
	if (samples.length === 0) {
		console.log(`${bucket.padEnd(12)}  0   no data, shipped temperature kept`);
		continue;
	}
	const report: CalibrationReport = crossValidate(samples, folds, threshold);
	const enough = samples.length >= MIN_SAMPLES;
	// A refit that does not lower the held-out ECE is noise on a small set.
	const better = report.eceAfter < report.eceBefore;
	if (enough && better) {
		table[bucket] = Number(report.temperature.toFixed(3));
		sizes[bucket] = samples.length;
	}
	console.log(
		`${bucket.padEnd(12)} ${String(report.n).padStart(3)}  ${pct(report.accuracy).padStart(4)}   ${report.shippedTemperature.toFixed(2)} -> ${report.temperature.toFixed(2)}   ${report.eceBefore.toFixed(3)} -> ${report.eceAfter.toFixed(3)}   ${pct(report.meanConfidenceBefore)} -> ${pct(report.meanConfidenceAfter)}   ${report.autoApproveBefore.count}/${report.autoApproveBefore.right} -> ${report.autoApprove.count}/${report.autoApprove.right}${enough ? (better ? "" : "   (held-out ECE not lower: shipped kept)") : `   (n < ${MIN_SAMPLES}: shipped kept)`}`,
	);
}

if (!process.argv.includes("--dry")) {
	const date = newest.slice(0, 10) || new Date().toISOString().slice(0, 10);
	const rows = Object.entries(table)
		.map(
			([bucket, t]) =>
				`\t"${bucket}": ${t}, // n = ${sizes[bucket as LayaBucket]}`,
		)
		.join("\n");
	await Bun.write(
		new URL("../src/laya-calibration.ts", import.meta.url),
		`import type { LayaCalibrationTable } from "#core/laya-calibrate";

/**
 * Laya temperature per (question type x option-count bucket), refitted on our
 * own labelled answers by \`bun run calibrate\` (NLL, golden-section; held-out
 * numbers in apps/docs/content/en/drafts/lessons-learned.md). Data collected ${date}: the message-
 * intent eval cases and the benchmark's enum/boolean choices. A bucket that
 * is missing (too little data, or the refit did not lower the held-out ECE) keeps Laya's shipped temperature. Do not edit by hand.
 */
export const LAYA_CALIBRATION: LayaCalibrationTable = {
${rows}
};
`,
	);
	console.log("\nwrote src/laya-calibration.ts");
}
