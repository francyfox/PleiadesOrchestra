import { expect, test } from "bun:test";
import { usesLayaCalibration } from "./decisions.service.ts";

test("only Laya models take the Laya calibration table, Jev ones do not", () => {
	expect(usesLayaCalibration("laya")).toBe(true);
	expect(usesLayaCalibration("jev-latest")).toBe(false);
	expect(usesLayaCalibration("jev-1.14.0")).toBe(false);
});
