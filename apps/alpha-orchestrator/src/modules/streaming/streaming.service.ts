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

/**
 * The same stream, calling `release` once when it ends: read to the end, failed,
 * or cancelled by the client (after the source has finished cancelling). Pull-based, so it ends when the client has read it.
 */
export function releaseWhenDone(
	stream: ReadableStream<Uint8Array>,
	release: () => void,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	let released = false;
	const once = () => {
		if (released) return;
		released = true;
		release();
	};
	return new ReadableStream({
		async pull(controller) {
			try {
				const chunk = await reader.read();
				if (chunk.done) {
					once();
					controller.close();
				} else controller.enqueue(chunk.value);
			} catch (error) {
				once();
				controller.error(error);
			}
		},
		// Only once the source has stopped: its usage is debited before that, so the
		// hold covers the cost until it is in the ledger.
		async cancel(reason) {
			try {
				await reader.cancel(reason);
			} finally {
				once();
			}
		},
	});
}
