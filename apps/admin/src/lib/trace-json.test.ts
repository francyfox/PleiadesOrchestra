import { expect, test } from "bun:test";
import { traceFileName, traceText } from "./trace-json.ts";

test("the trace is written with one-space indent, like the inspector's Trace button", () => {
	expect(traceText([{ userPrompt: { message: "hi" } }])).toBe(
		'[\n {\n  "userPrompt": {\n   "message": "hi"\n  }\n }\n]',
	);
});

test("the file is named after the request", () => {
	expect(traceFileName("314a68f0-5072")).toBe("trace-314a68f0-5072.json");
});
