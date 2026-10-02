type Json = Record<string, unknown>;

interface SchemaNode {
	type?: string | string[];
	enum?: unknown[];
	properties?: Record<string, unknown>;
	required?: string[];
	items?: unknown;
}

const FENCE = /^```(?:json)?\s*|\s*```$/g;
const THINK = /<think>[\s\S]*?(<\/think>|$)/g;

/**
 * Closes every open `[`/`{` of a cut-off JSON text, in reverse. A text cut off
 * inside a string is left alone: closing it would turn "chee" into a value the
 * model never meant — that one goes back to the model instead.
 */
function closeOpen(text: string): string {
	const stack: string[] = [];
	let inString = false;
	let escaped = false;
	for (const char of text) {
		if (inString) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === '"') inString = false;
		} else if (char === '"') inString = true;
		else if (char === "{") stack.push("}");
		else if (char === "[") stack.push("]");
		else if (char === "}" || char === "]") stack.pop();
	}
	return inString ? text : text + stack.reverse().join("");
}

function parseLoosely(text: string): unknown {
	const cleaned = text.replace(THINK, "").trim().replace(FENCE, "").trim();
	const start = cleaned.indexOf("{");
	if (start === -1) return undefined;
	const end = cleaned.lastIndexOf("}");
	const candidates = [
		cleaned.slice(start, end > start ? end + 1 : undefined),
		cleaned.slice(start),
	];
	for (const candidate of candidates) {
		for (const variant of [candidate, closeOpen(candidate)]) {
			const withoutCommas = variant.replace(/,\s*([}\]])/g, "$1");
			for (const attempt of [variant, withoutCommas]) {
				try {
					return JSON.parse(attempt);
				} catch {
					// try the next repair
				}
			}
		}
	}
	return undefined;
}

function coerce(schema: unknown, value: unknown): unknown {
	const node = (schema ?? {}) as SchemaNode;
	const types = node.type === undefined ? [] : [node.type].flat();
	if (types.length === 0) return value;
	if (types.includes("array")) {
		const list = Array.isArray(value) ? value : [value];
		return node.items ? list.map((item) => coerce(node.items, item)) : list;
	}
	if (types.includes("object") && value && typeof value === "object") {
		const object = value as Json;
		const result: Json = {};
		for (const [key, item] of Object.entries(object)) {
			result[key] = coerce(node.properties?.[key], item);
		}
		return result;
	}
	if (typeof value === "string") {
		const text = value.trim();
		if (
			(types.includes("integer") || types.includes("number")) &&
			text !== "" &&
			Number.isFinite(Number(text))
		) {
			return Number(text);
		}
		if (types.includes("boolean") && /^(true|false)$/i.test(text)) {
			return text.toLowerCase() === "true";
		}
		const option = node.enum?.find(
			(candidate) =>
				typeof candidate === "string" &&
				candidate.toLowerCase() === text.toLowerCase(),
		);
		if (option !== undefined) return option;
	}
	return value;
}

/**
 * The "formatter" in front of schema validation: turns what a small model
 * actually wrote into the object it meant — cuts fences, `<think>` blocks and
 * chatter, drops trailing commas, closes a cut-off object, coerces values to
 * the schema's types ("3" → 3, "vegan" → ["vegan"], "dairy" → "Dairy") and
 * treats `null` for an optional field as "not given". Only mechanical fixes:
 * it never invents a value (a string cut off mid-way is not completed). `undefined` when no object can be recovered — the
 * caller then sends the problem back to the model.
 */
export function repairArguments(
	text: string,
	schema: SchemaNode,
): Json | undefined {
	const parsed = parseLoosely(text);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return undefined;
	}
	const required = new Set(schema.required ?? []);
	const result: Json = {};
	for (const [key, value] of Object.entries(parsed as Json)) {
		if (value === null && !required.has(key)) continue;
		result[key] = coerce(schema.properties?.[key], value);
	}
	return result;
}
