import type { UnderstoodAttribute } from "#core/goap/understanding";

/** Function words that would make any description "match"; language grammar, not domain. */
const STOP = new Set([
	"the",
	"and",
	"for",
	"with",
	"from",
	"that",
	"this",
	"not",
	"are",
	"any",
	"all",
	"its",
	"your",
]);

/** Lowercase words of a text, camelCase and snake_case split, plural `s` stripped. */
export function wordsOf(text: string): Set<string> {
	const out = new Set<string>();
	for (const raw of text
		.replace(/([a-z\d])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^\p{L}]+/u)) {
		if (raw.length < 3 || STOP.has(raw)) continue;
		out.add(
			raw.endsWith("ies")
				? `${raw.slice(0, -3)}y`
				: raw.replace(/(?<=[^s])s$/, ""),
		);
	}
	return out;
}

/**
 * The stated attributes that talk about this enum parameter: the words of the
 * attribute's name or value overlap the parameter's name, description or one of
 * its values.
 * shortcut: lexical only, so "for 6 people" never reaches number_of_persons;
 * upgrade to embeddings when a site's parameters need it.
 */
export function matchingAttributes(
	attributes: UnderstoodAttribute[],
	parameter: { name: string; description?: string; values: string[] },
): UnderstoodAttribute[] {
	const target = wordsOf(
		[parameter.name, parameter.description ?? "", ...parameter.values].join(
			" ",
		),
	);
	return attributes.filter((attribute) =>
		[...wordsOf(`${attribute.name} ${attribute.value}`)].some((word) =>
			target.has(word),
		),
	);
}
