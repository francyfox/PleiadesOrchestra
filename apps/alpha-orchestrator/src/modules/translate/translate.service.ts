import { reportTokens } from "@repo/core";

export class TextTooLongError extends Error {
	constructor(readonly limit: number) {
		super(`text is longer than ${limit} characters`);
	}
}

/** What the native side offers; `translate-engine.ts` backs it with the real C library. */
export interface NativeCalls {
	/** `tr_translate`: bytes written, -1 on error (message in `out`), or -(needed + 2) when `out` is too small. */
	call(text: Uint8Array, out: Uint8Array): number;
	/** `tr_last_tokens`: the SentencePiece token counts (source with `</s>`, translation) of the last successful call. */
	tokens?(): { inputTokens: number; outputTokens: number };
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
	tokens,
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
		if (tokens) reportTokens(tokens());
		return decoder.decode(out.subarray(0, written)).trim();
	};
}

const LATIN_LETTER = /\p{Script=Latin}/u;
const OTHER_LETTER = /(?!\p{Script=Latin})\p{L}/u;

type Kind = "latin" | "other" | "neutral";

const kindOf = (word: string): Kind =>
	OTHER_LETTER.test(word)
		? "other"
		: LATIN_LETTER.test(word)
			? "latin"
			: "neutral";

/**
 * What Opus-MT adds to a bare imperative («купи» → "Buy it."): the object
 * pronoun. When Latin words follow, they are the object, so it goes.
 */
const STRAY_OBJECT = /\s+(?:it|them|this|that|one)$/i;

/** A fragment as the model returns it, fitted back into the sentence. */
function fitted(
	translated: string,
	source: string,
	first: boolean,
	beforeLatin: boolean,
): string {
	let text = translated.trim();
	if (!/[.!?…]$/.test(source.trim())) text = text.replace(/[.!?…]+$/, "");
	if (beforeLatin) text = text.replace(STRAY_OBJECT, "");
	if (!first && /^\p{Lu}\p{Ll}/u.test(text))
		text = text[0]?.toLowerCase() + text.slice(1);
	return text;
}

/**
 * Translates a message but leaves its Latin-script words as typed: a shopper
 * writing «купи Medium Roast Coffee Beans» names the product the way the site
 * shows it, and Opus-MT, given the whole line, turned it into "Media Road
 * Coffee Beans". Each run of non-Latin words is translated on its own; digits
 * and punctuation between two Latin words stay with them (iPhone 15 Pro). A
 * message without Latin words goes to the model in one piece, as before.
 */
export async function translateAroundLatin(
	text: string,
	translate: (text: string) => string | Promise<string>,
): Promise<string> {
	const tokens = text.trim().split(/(\s+)/);
	const words = tokens.filter((_, i) => i % 2 === 0);
	const kinds = words.map(kindOf);
	if (!kinds.includes("latin")) return translate(text);

	// A neutral word (a number, a dash) between two Latin ones belongs to them.
	const resolved = kinds.map((kind, i): Exclude<Kind, "neutral"> => {
		if (kind !== "neutral") return kind;
		const before = kinds.slice(0, i).findLast((k) => k !== "neutral");
		const after = kinds.slice(i + 1).find((k) => k !== "neutral");
		return before === "latin" && (after === "latin" || after === undefined)
			? "latin"
			: "other";
	});

	const groups: { kind: "latin" | "other"; text: string }[] = [];
	words.forEach((word, i) => {
		const kind = resolved[i] as "latin" | "other";
		const space = i > 0 ? (tokens[i * 2 - 1] ?? " ") : "";
		const last = groups.at(-1);
		if (last && last.kind === kind) last.text += space + word;
		else groups.push({ kind, text: word });
	});

	const parts = await Promise.all(
		groups.map(async (group, i) =>
			group.kind === "other" && OTHER_LETTER.test(group.text)
				? fitted(
						await translate(group.text),
						group.text,
						i === 0,
						groups[i + 1]?.kind === "latin",
					)
				: group.text,
		),
	);
	return parts.filter(Boolean).join(" ");
}
