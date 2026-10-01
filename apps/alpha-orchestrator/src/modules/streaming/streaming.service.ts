const encoder = new TextEncoder();

/** One NDJSON line: the JSON value followed by a newline. */
export function encodeNdjsonLine(value: unknown): Uint8Array {
	return encoder.encode(`${JSON.stringify(value)}\n`);
}

/**
 * Wraps an NDJSON stream in gzip when the client accepts it. The repeated
 * `{"type":"delta","text":"…"}` framing compresses to almost nothing, and
 * `CompressionStream` works chunk by chunk, so the first bytes are not held
 * back until the whole reply is done. Gzip only: the web-standard
 * `CompressionStream` has no streaming brotli.
 */
export function compressIfAccepted(
	stream: ReadableStream<Uint8Array>,
	acceptEncoding: string | null,
): { body: ReadableStream<Uint8Array>; encoding?: "gzip" } {
	if (!acceptEncoding?.includes("gzip")) return { body: stream };
	// lib.dom types `CompressionStream.writable` as `BufferSource`, wider than
	// what `pipeThrough` wants; at runtime it is bytes in, bytes out.
	const gzip = new CompressionStream("gzip") as unknown as ReadableWritablePair<
		Uint8Array,
		Uint8Array
	>;
	return { body: stream.pipeThrough(gzip), encoding: "gzip" };
}

/** An NDJSON `Response`, gzipped when the request allows it. `headers` are added (e.g. CORS). */
export function ndjsonResponse(
	stream: ReadableStream<Uint8Array>,
	request: Request,
	headers: Record<string, string> = {},
): Response {
	const { body, encoding } = compressIfAccepted(
		stream,
		request.headers.get("accept-encoding"),
	);
	return new Response(body, {
		headers: {
			...headers,
			"content-type": "application/x-ndjson",
			...(encoding ? { "content-encoding": encoding } : {}),
		},
	});
}
