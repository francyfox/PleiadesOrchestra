import { expect, test } from "bun:test";
import { sessionOptionsFor } from "./decision-engine.service.ts";

test("pins onnxruntime to the given number of intra-op threads, one inter-op thread", () => {
	expect(sessionOptionsFor(6)).toEqual({
		intraOpNumThreads: 6,
		interOpNumThreads: 1,
	});
});

test("0 threads leaves onnxruntime's own default", () => {
	expect(sessionOptionsFor(0)).toBeUndefined();
});
