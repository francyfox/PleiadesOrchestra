import { describe, expect, test } from "bun:test";
import { chunkText } from "./chunk.ts";

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

		expect(chunks).toEqual(["one two", "three four", "five six", "seven eight"]);
	});

	test("every chunk fits within maxChunkSize when the text has word breaks", () => {
		const text = "the quick brown fox jumps over the lazy dog ".repeat(10).trim();
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
