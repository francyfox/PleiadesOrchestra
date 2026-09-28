import Fuse from "fuse.js";

export interface FaqEntry {
	id: string;
	q: string;
	a: string;
}

/** Below this many characters a query is matched as plain text: fuzzy matching on one or two letters is noise. */
const FUZZY_FROM = 3;

/**
 * Search over the questions and answers of the FAQ, in whatever language they
 * are currently shown. An empty query keeps every entry in reading order.
 * Otherwise the ids come back best first: entries that contain the text
 * as typed (in the question before only in the answer), then — from three
 * characters on — Fuse.js fuzzy matches, which forgive typos.
 */
export function createFaqSearch(entries: readonly FaqEntry[]) {
	const fuse = new Fuse([...entries], {
		keys: [
			{ name: "q", weight: 2 },
			{ name: "a", weight: 1 },
		],
		threshold: 0.35,
		ignoreLocation: true,
		minMatchCharLength: 2,
	});

	return (query: string): string[] => {
		const text = query.trim();
		if (!text) return entries.map((entry) => entry.id);

		const needle = text.toLowerCase();
		const inQuestion = entries.filter((entry) =>
			entry.q.toLowerCase().includes(needle),
		);
		const inAnswerOnly = entries.filter(
			(entry) =>
				!inQuestion.includes(entry) && entry.a.toLowerCase().includes(needle),
		);
		const exact = [...inQuestion, ...inAnswerOnly].map((entry) => entry.id);
		if (text.length < FUZZY_FROM) return exact;

		const seen = new Set(exact);
		const fuzzy = fuse
			.search(text)
			.map((result) => result.item.id)
			.filter((id) => !seen.has(id));
		return [...exact, ...fuzzy];
	};
}
