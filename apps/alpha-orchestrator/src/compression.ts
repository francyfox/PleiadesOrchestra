/**
 * Wraps an NDJSON stream in gzip when the client accepts it. The repeated
 * `{"type":"delta","text":"…"}` framing compresses to almost nothing, and
 * `CompressionStream` compresses incrementally chunk-by-chunk — unlike
 * gzipping a full buffer, it never holds the first byte hostage to the
 * whole reply finishing. Gzip only: the web-standard `CompressionStream`
 * has no streaming brotli format.
 */
export function compressIfAccepted(
	stream: ReadableStream<Uint8Array>,
	acceptEncoding: string | null,
): { body: ReadableStream<Uint8Array>; encoding?: "gzip" } {
	if (!acceptEncoding?.includes("gzip")) return { body: stream };
	// lib.dom's `CompressionStream.writable` is typed `BufferSource`, wider
	// than `pipeThrough`'s `Uint8Array` — a real mismatch in the type defs,
	// not in what actually flows at runtime (bytes in, bytes out).
	const gzip = new CompressionStream("gzip") as unknown as ReadableWritablePair<
		Uint8Array,
		Uint8Array
	>;
	return { body: stream.pipeThrough(gzip), encoding: "gzip" };
}
