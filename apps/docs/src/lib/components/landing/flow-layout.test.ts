import { expect, test } from "bun:test";
import { layoutFlow } from "./flow-layout.ts";

const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

test("wide: snake of rows of four, hand-off down at the row end", () => {
	const { slots, height } = layoutFlow(ids, false, "d");
	expect(slots.a).toMatchObject({ x: 0, y: 0, out: "right" });
	expect(slots.d).toMatchObject({ x: 780, out: "right" }); // fan owner
	expect(slots.e).toMatchObject({ x: 780, y: 300, in: "top", out: "left" });
	expect(slots.h).toMatchObject({ x: 0, y: 300, out: "bottom" });
	expect(slots.i).toMatchObject({ x: 0, y: 600, in: "top" });
	expect(height).toBe(40);
});

test("narrow: one column, room under the fan owner", () => {
	const { slots, fan } = layoutFlow(ids.slice(0, 5), true, "d");
	expect(slots.d).toMatchObject({ x: 0, y: 360, out: "right" });
	expect(slots.e.y).toBe(600);
	expect(fan).toEqual({ x: 240, y: 290 });
});
