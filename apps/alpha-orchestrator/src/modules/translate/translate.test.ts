import { describe, expect, test } from "bun:test";
import { createTranslator, TextTooLongError } from "./translate.service.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A stand-in for the C function: writes `reply` NUL-terminated, like `tr_translate`. */
function fakeNative(reply: (text: string) => string) {
	const calls: { text: string; capacity: number }[] = [];
	return {
		calls,
		call(text: Uint8Array, out: Uint8Array): number {
			const input = decoder.decode(text.subarray(0, text.length - 1));
			calls.push({ text: input, capacity: out.length });
			const bytes = encoder.encode(reply(input));
			if (bytes.length + 1 > out.length) return -(bytes.length + 2);
			out.set(bytes);
			out[bytes.length] = 0;
			return bytes.length;
		},
		free() {},
	};
}

describe("createTranslator", () => {
	test("sends the text NUL-terminated and returns what the native side wrote", () => {
		const native = fakeNative((text) => `[${text}]`);
		const translate = createTranslator(native);
		expect(translate("купи 1 сыр")).toBe("[купи 1 сыр]");
		expect(native.calls[0]?.text).toBe("купи 1 сыр");
	});

	test("an empty or blank text is not worth a call", () => {
		const native = fakeNative(() => "x");
		const translate = createTranslator(native);
		expect(translate("   ")).toBe("");
		expect(native.calls).toHaveLength(0);
	});

	test("an answer that does not fit the buffer is asked for again with room", () => {
		const long = "я".repeat(900);
		const native = fakeNative(() => long);
		const translate = createTranslator({ ...native, initialBuffer: 64 });
		expect(translate("текст")).toBe(long);
		expect(native.calls).toHaveLength(2);
		expect(native.calls[1]?.capacity).toBeGreaterThan(
			native.calls[0]?.capacity ?? 0,
		);
	});

	test("a native error carries its message", () => {
		const translate = createTranslator({
			call(_text, out) {
				const bytes = encoder.encode("model exploded");
				out.set(bytes);
				out[bytes.length] = 0;
				return -1;
			},
			free() {},
		});
		expect(() => translate("привет")).toThrow("model exploded");
	});

	test("a text over the limit is refused before it reaches the model", () => {
		const native = fakeNative(() => "x");
		const translate = createTranslator({ ...native, maxChars: 10 });
		expect(() => translate("x".repeat(11))).toThrow(TextTooLongError);
		expect(native.calls).toHaveLength(0);
	});
});
