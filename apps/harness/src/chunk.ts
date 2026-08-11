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
	let remaining = text;

	while (remaining.length > maxChunkSize) {
		let splitAt = remaining.lastIndexOf(" ", maxChunkSize);
		if (splitAt <= 0) {
			splitAt = maxChunkSize;
		}
		chunks.push(remaining.slice(0, splitAt));
		remaining = remaining.slice(splitAt).replace(/^ +/, "");
	}

	if (remaining.length > 0) chunks.push(remaining);

	return chunks;
}
