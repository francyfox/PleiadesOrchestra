import { expect, test } from "bun:test";
import { ruleErrors } from "./guardrails-rules.ts";

test("comments and blanks are skipped; each bad line is reported with its 1-based number", () => {
	expect(ruleErrors("# note\n\nfoo\\s+bar\n(\n" + "a".repeat(501))).toEqual([
		{ line: 4, message: expect.any(String) },
		{ line: 5, message: "Longer than 500 characters" },
	]);
});

test("the 501st rule is an error", () => {
	const text = Array.from({ length: 501 }, (_, i) => `r${i}`).join("\n");
	expect(ruleErrors(text)).toEqual([
		{ line: 501, message: "More than 500 rules" },
	]);
});
