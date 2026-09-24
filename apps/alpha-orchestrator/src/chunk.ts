/**
 * Splits text into chunks of at most `maxChunkSize` characters, breaking on
 * word boundaries where possible so a chunk never cuts a word in half. A
 * single word longer than `maxChunkSize` is hard-cut — there's no boundary
 * to break on.
 *
 * A plain function rather than a transferum pipeline: there's only one
 * transform step here, no push/pull/subscribe semantics needed.
 */
export function chunkText(text: string, maxChunkSize: number): string[] {
	if (text.length <= maxChunkSize) return [text];

	const chunks: string[] = [];
	// Index into `text` rather than repeatedly `.slice()`-ing a shrinking
	// "remaining" string — the old version copied the entire remaining tail
	// on every iteration (O(n^2) for many chunks), this is O(n) total.
	let start = 0;

	while (text.length - start > maxChunkSize) {
		let splitAt = text.lastIndexOf(" ", start + maxChunkSize);
		if (splitAt <= start) {
			splitAt = start + maxChunkSize;
		}
		chunks.push(text.slice(start, splitAt));
		start = splitAt;
		while (text[start] === " ") start++;
	}

	if (start < text.length) chunks.push(text.slice(start));

	return chunks;
}
