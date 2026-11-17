import { expect, test } from "bun:test";
import { END_X, INTRO_LENGTH, PRESS, poseAt, STAMP_AT, TRAY_X } from "./splash-pose.ts";

test("the head is over the tray and fully down at each stamp", () => {
	STAMP_AT.forEach((s, i) => {
		const p = poseAt(s);
		expect(p.x).toBeCloseTo(TRAY_X[i] ?? 0, 5);
		expect(p.dip).toBeCloseTo(PRESS, 5);
	});
});

test("it rests between stamps and the logos stay inked", () => {
	expect(poseAt(0).dip).toBe(0);
	expect(poseAt(INTRO_LENGTH).inked.every((v) => v === 1)).toBe(true);
	expect(poseAt(0).inked.every((v) => v < 0.2)).toBe(true);
});

test("cues fire once while playing and never on a seek", async () => {
	const { cuesBetween } = await import("./splash-pose.ts");
	const at = STAMP_AT[0] as number;
	expect(cuesBetween(at - 0.1, at + 0.1).map((c) => c.kind)).toEqual(["stamp"]);
	expect(cuesBetween(at + 0.1, at + 0.2)).toEqual([]);
	expect(cuesBetween(0, INTRO_LENGTH)).toEqual([]);
});

test("the head ends the intro over the blank tray", () => {
	expect(poseAt(INTRO_LENGTH).x).toBeCloseTo(END_X, 5);
	expect(poseAt(INTRO_LENGTH).dip).toBe(0);
});
