export type ReplyPart =
	| { kind: "text"; text: string }
	| { kind: "link"; text: string; href: string };

export interface ParsedReply {
	parts: ReplyPart[];
	/** The trailing numbered list, each item a phrase the visitor can send as their own message. */
	options: string[];
}

const ITEM = /^\s*(\d)\.\s+(\S.*?)\s*$/;
// shortcut: a URL with a ")" inside is cut at it, upgrade when the site sends such links
const LINK = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;

/** Splits a trailing `1. … 2. …` list (2..9 items, consecutive from 1) off the text. */
function splitOptions(text: string): { text: string; options: string[] } {
	const lines = text.trimEnd().split("\n");
	const items: string[] = [];
	let at = lines.length;
	while (at > 0) {
		const match = ITEM.exec(lines[at - 1] ?? "");
		if (!match) break;
		items.unshift(match[2] as string);
		at--;
	}
	const numbers = lines.slice(at).map((line) => Number(ITEM.exec(line)?.[1]));
	const valid =
		items.length >= 2 &&
		items.length <= 9 &&
		numbers.every((n, i) => n === i + 1);
	return valid
		? { text: lines.slice(0, at).join("\n").trimEnd(), options: items }
		: { text, options: [] };
}

function isWeb(href: string): boolean {
	try {
		const { protocol } = new URL(href);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * An assistant reply → text and link parts plus the options list. Safe on a
 * partial (streaming) text: an unfinished list or link just stays text. Only
 * `http:`/`https:` links are links; the rest is shown as written.
 */
export function parseReply(raw: string): ParsedReply {
	const { text, options } = splitOptions(raw);
	const parts: ReplyPart[] = [];
	const pushText = (chunk: string) => {
		if (!chunk) return;
		const prev = parts[parts.length - 1];
		if (prev?.kind === "text") prev.text += chunk;
		else parts.push({ kind: "text", text: chunk });
	};
	let from = 0;
	for (const match of text.matchAll(LINK)) {
		const [whole, title, href] = match as unknown as [string, string, string];
		pushText(text.slice(from, match.index));
		if (isWeb(href)) parts.push({ kind: "link", text: title, href });
		else pushText(whole);
		from = (match.index ?? 0) + whole.length;
	}
	pushText(text.slice(from));
	return { parts, options };
}
