import { createMapOperator, createPipelineOperator } from "transferum";

/**
 * Splits text into chunks of at most `maxChunkSize` characters, breaking on
 * spaces where possible so a word is not cut in half. A single word longer
 * than `maxChunkSize` is cut hard — there is no space to break on.
 */
export function chunkText(text: string, maxChunkSize: number): string[] {
	if (text.length <= maxChunkSize) return [text];

	const chunks: string[] = [];
	// Walk an index through the text instead of slicing a shrinking "rest"
	// string: copying the tail on every step would make this O(n²).
	let start = 0;

	while (text.length - start > maxChunkSize) {
		let splitAt = text.lastIndexOf(" ", start + maxChunkSize);
		if (splitAt <= start) splitAt = start + maxChunkSize;
		chunks.push(text.slice(start, splitAt));
		start = splitAt;
		while (text[start] === " ") start++;
	}

	if (start < text.length) chunks.push(text.slice(start));
	return chunks;
}

/**
 * Cleans user text before it reaches the model: canonical unicode, one space
 * between words, no control characters. A pure sync pipeline — no transferum
 * transfer graph needed.
 */
export const normalizeText = createPipelineOperator<string, string>([
	createMapOperator((text: string) => text.normalize("NFC")),
	// Collapse whitespace (incl. newlines/tabs) *before* stripping control
	// characters, otherwise "hi\nthere" would become "hithere".
	createMapOperator((text: string) => text.replace(/\s+/g, " ")),
	createMapOperator((text: string) => text.replace(/\p{Cc}/gu, "")),
	createMapOperator((text: string) => text.trim()),
]);
