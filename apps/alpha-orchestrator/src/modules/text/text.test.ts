import { describe, expect, test } from "bun:test";
import { chunkText, normalizeText } from "./text.service.ts";

describe("chunkText", () => {
	test("returns a single chunk when text fits within the budget", () => {
		expect(chunkText("hello world", 100)).toEqual(["hello world"]);
	});

	test("returns a single-element array for empty text", () => {
		expect(chunkText("", 10)).toEqual([""]);
	});

	test("splits long text on word boundaries", () => {
		const text = "one two three four five six seven eight";
		const chunks = chunkText(text, 12);

		expect(chunks).toEqual([
			"one two",
			"three four",
			"five six",
			"seven eight",
		]);
	});

	test("every chunk fits within maxChunkSize when the text has word breaks", () => {
		const text = "the quick brown fox jumps over the lazy dog "
			.repeat(10)
			.trim();
		const chunks = chunkText(text, 20);

		for (const chunk of chunks) {
			expect(chunk.length).toBeLessThanOrEqual(20);
		}
	});

	test("hard-cuts a single word longer than maxChunkSize", () => {
		const longWord = "a".repeat(30);
		const chunks = chunkText(longWord, 10);

		expect(chunks.join("")).toBe(longWord);
		for (const chunk of chunks) {
			expect(chunk.length).toBeLessThanOrEqual(10);
		}
	});

	test("reassembling chunks with spaces reproduces the original words", () => {
		const text = "one two three four five six seven eight";
		const chunks = chunkText(text, 12);

		expect(chunks.join(" ")).toBe(text);
	});
});

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
