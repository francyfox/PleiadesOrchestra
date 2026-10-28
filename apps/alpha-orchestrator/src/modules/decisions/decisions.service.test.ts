import { expect, test } from "bun:test";
import { usesLayaCalibration } from "./decisions.service.ts";

test("only Laya models take the Laya calibration table, any other model keeps its own probabilities", () => {
	expect(usesLayaCalibration("laya")).toBe(true);
	expect(usesLayaCalibration("jev-latest")).toBe(false);
	expect(usesLayaCalibration("liquid/d1-ultra")).toBe(false);
	expect(usesLayaCalibration("perplexity/pplx-decider-v1.2")).toBe(false);
});
