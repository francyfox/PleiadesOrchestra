import type { ToolSpec } from "./tools.ts";

type Args = Record<string, unknown>;
interface Property {
	type?: string;
	enum?: unknown[];
	items?: { type?: string; enum?: unknown[] };
}

/** Words of a label ("Dairy & Eggs" → dairy, eggs), without filler. */
const words = (label: string) =>
	label
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length >= 3);

const hasWord = (request: string, word: string) =>
	new RegExp(`(^|[^a-z0-9])${word}`, "i").test(request);

/** Numbers written in the request (`5`, `4.50`, `$4.5`). */
function numbersIn(request: string): number[] {
	return [...request.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) =>
		Number((m[0] as string).replace(",", ".")),
	);
}

/** An enum value is grounded when the request says one of its words (for tags: the distinctive first word). */
function enumGrounded(
	value: string,
	request: string,
	firstWordOnly: boolean,
): boolean {
	const candidates = words(value);
	const used = firstWordOnly ? candidates.slice(0, 1) : candidates;
	return used.some((word) => hasWord(request, word));
}

/**
 * Removes optional arguments the request gives no reason for. A small model
 * fills every field it is shown ("department": "Frozen" for an apple,
 * "max_price": 100); a filter the shopper never asked for silently empties the
 * results, so each optional enum, number and enum-list must be backed by words
 * of the request. Required fields are never touched. A diet word left inside
 * `query` ("vegan chips") moves to the `dietary` filter.
 */
export function groundArguments(
	tool: ToolSpec,
	args: Args,
	request: string,
): Args {
	const schema = tool.inputSchema as {
		properties?: Record<string, Property>;
		required?: string[];
	};
	const required = new Set(schema.required ?? []);
	const text = request.toLowerCase();
	const numbers = numbersIn(text);
	const result: Args = {};

	for (const [key, value] of Object.entries(args)) {
		const property = schema.properties?.[key];
		if (!property || required.has(key)) {
			result[key] = value;
			continue;
		}
		if (Array.isArray(value)) {
			const kept =
				property.items?.enum && value.every((item) => typeof item === "string")
					? (value as string[]).filter((item) => enumGrounded(item, text, true))
					: value;
			if (kept.length > 0) result[key] = kept;
		} else if (typeof value === "number") {
			if (numbers.includes(value)) result[key] = value;
		} else if (typeof value === "string" && property.enum) {
			if (enumGrounded(value, text, false)) result[key] = value;
		} else if (value !== "" && value !== null && value !== undefined) {
			result[key] = value;
		}
	}
	return moveDietWordsOutOfQuery(schema.properties, result, text);
}

function moveDietWordsOutOfQuery(
	properties: Record<string, Property> | undefined,
	args: Args,
	request: string,
): Args {
	const tags = (properties?.dietary?.items?.enum ?? []) as string[];
	if (typeof args.query !== "string" || tags.length === 0) return args;

	let query = args.query;
	const dietary = new Set<string>(
		Array.isArray(args.dietary) ? (args.dietary as string[]) : [],
	);
	for (const tag of tags) {
		const word = words(tag)[0];
		if (!word || !hasWord(query.toLowerCase(), word) || !hasWord(request, word))
			continue;
		dietary.add(tag);
		const rest = query
			.replace(new RegExp(`\\b${word}\\w*\\b`, "i"), "")
			.replace(/\s+/g, " ")
			.trim();
		if (rest) query = rest;
	}
	return dietary.size > 0
		? { ...args, query, dietary: [...dietary] }
		: { ...args, query };
}
