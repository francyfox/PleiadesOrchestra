export class TextTooLongError extends Error {
	constructor(readonly limit: number) {
		super(`text is longer than ${limit} characters`);
	}
}

/** What the native side offers; `translate-engine.ts` backs it with the real C library. */
export interface NativeCalls {
	/** `tr_translate`: bytes written, -1 on error (message in `out`), or -(needed + 2) when `out` is too small. */
	call(text: Uint8Array, out: Uint8Array): number;
	free(): void;
}

export interface TranslatorOptions extends NativeCalls {
	/** Longest text accepted; a shopper's message is a sentence, not a document. */
	maxChars?: number;
	initialBuffer?: number;
}

export type Translate = (text: string) => string;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Text in, text out over the native `tr_translate`: UTF-8, NUL-terminated,
 * the output buffer grown once when the answer doesn't fit. Synchronous on
 * purpose — the call is a ~30 ms CPU burst and Bun's FFI blocks anyway, so
 * calls queue one behind another instead of fighting over the model's threads.
 */
export function createTranslator({
	call,
	maxChars = 500,
	initialBuffer = 1024,
}: TranslatorOptions): Translate {
	return (text) => {
		const trimmed = text.trim();
		if (trimmed === "") return "";
		if (trimmed.length > maxChars) throw new TextTooLongError(maxChars);

		const input = new Uint8Array([...encoder.encode(trimmed), 0]);
		let out = new Uint8Array(initialBuffer);
		let written = call(input, out);
		if (written <= -2) {
			out = new Uint8Array(-written - 2 + 1);
			written = call(input, out);
		}
		if (written < 0) {
			const end = out.indexOf(0);
			throw new Error(
				decoder.decode(out.subarray(0, end === -1 ? out.length : end)) ||
					"translation failed",
			);
		}
		return decoder.decode(out.subarray(0, written)).trim();
	};
}
