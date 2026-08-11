import { describe, expect, test } from "bun:test";
import { normalizeText } from "./normalize.ts";

describe("normalizeText", () => {
	test("trims leading and trailing whitespace", () => {
		expect(normalizeText.apply("  hi there  ")).toBe("hi there");
	});

	test("collapses runs of whitespace, including newlines and tabs, into a single space", () => {
		expect(normalizeText.apply("hi\n\n\tthere   friend")).toBe(
			"hi there friend",
		);
	});

	test("strips control characters", () => {
		const withControlChars = `hi${String.fromCharCode(0)}${String.fromCharCode(7)}there`;
		expect(normalizeText.apply(withControlChars)).toBe("hithere");
	});

	test("normalizes unicode to NFC form", () => {
		// "é" as "e" + combining acute accent (NFD) vs. precomposed "é" (NFC)
		const decomposed = "é";
		const precomposed = "é";
		expect(normalizeText.apply(decomposed)).toBe(precomposed);
	});

	test("leaves already-clean text unchanged", () => {
		expect(normalizeText.apply("hello world")).toBe("hello world");
	});

	test("empty string stays empty", () => {
		expect(normalizeText.apply("")).toBe("");
	});
});
