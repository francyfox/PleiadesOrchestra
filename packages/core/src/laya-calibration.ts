import type { LayaCalibrationTable } from "./laya-calibrate";

/**
 * Laya temperature per (question type x option-count bucket), refitted on our
 * own labelled answers by `bun run calibrate` (NLL, golden-section; held-out
 * numbers in docs/lessons-learned.md). Data collected 2026-10-15: the message-
 * intent eval cases and the benchmark's enum/boolean choices. A bucket that
 * is missing (too little data) keeps Laya's shipped temperature. Do not edit by hand.
 */
export const LAYA_CALIBRATION: LayaCalibrationTable = {
	"choice:3-5": 1.218, // n = 47
	"choice:6-10": 1.192, // n = 95
};
