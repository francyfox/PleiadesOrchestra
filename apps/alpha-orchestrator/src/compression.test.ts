import { describe, expect, test } from "bun:test";
import { compressIfAccepted } from "./compression.ts";

function streamOf(text: string): ReadableStream<Uint8Array> {
	const bytes = new TextEncoder().encode(text);
	return new ReadableStream({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});
}

async function textOf(stream: ReadableStream<Uint8Array>): Promise<string> {
	return new Response(stream).text();
}

describe("compressIfAccepted", () => {
	test("passes the stream through unchanged when the client doesn't accept gzip", async () => {
		const { body, encoding } = compressIfAccepted(streamOf("hello"), null);
		expect(encoding).toBeUndefined();
		expect(await textOf(body)).toBe("hello");
	});

	test("passes through when accept-encoding names other codecs, not gzip", async () => {
		const { body, encoding } = compressIfAccepted(
			streamOf("hello"),
			"br, deflate",
		);
		expect(encoding).toBeUndefined();
		expect(await textOf(body)).toBe("hello");
	});

	test("gzips the stream when the client accepts gzip, and it decompresses back losslessly", async () => {
		const original =
			'{"type":"delta","text":"Как"}\n{"type":"delta","text":" я"}\n';
		const { body, encoding } = compressIfAccepted(
			streamOf(original),
			"gzip, deflate, br",
		);
		expect(encoding).toBe("gzip");

		const gunzip = new DecompressionStream(
			"gzip",
		) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
		const decompressed = body.pipeThrough(gunzip);
		expect(await textOf(decompressed)).toBe(original);
	});
});
