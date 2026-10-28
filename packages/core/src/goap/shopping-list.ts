import type { WorldState } from "#core/goap/types";

// A request for several things at once («buy A, B, C») is carried through the
// run as three JSON-string facts, because a WorldState holds only primitives.
// The names are deliberately unlike any tool parameter: `buildArguments` copies
// a fact into the parameter of the same name, and an add-to-cart tool has an
// `items` parameter.

/** What the shopper asked for, one entry per thing: `name` = the search query. */
export const REQUESTED_ITEMS = "requestedItems";
/** What the searches found: `name` = the product's own name from the site's answer. */
export const FOUND_ITEMS = "foundItems";
/** Requested things the site had nothing for: `name` = the search query. */
export const MISSING_ITEMS = "missingItems";

export interface ListItem {
	name: string;
	quantity: number;
}

/** The list stored in fact `key`; empty when the fact is absent or not a list. */
export function readItems(state: WorldState, key: string): ListItem[] {
	const raw = state[key];
	if (typeof raw !== "string" || !raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(item): item is ListItem =>
				typeof item === "object" &&
				item !== null &&
				typeof (item as ListItem).name === "string" &&
				typeof (item as ListItem).quantity === "number",
		);
	} catch {
		return [];
	}
}

/** The fact value for a list; `undefined` for an empty one (the fact is dropped). */
export function writeItems(items: ListItem[]): string | undefined {
	return items.length > 0 ? JSON.stringify(items) : undefined;
}

/** «2 × A, 1 × B» — a list as text for a sentence or a step line. */
export function itemsText(items: ListItem[]): string {
	return items.map((item) => `${item.quantity} × ${item.name}`).join(", ");
}

// --- the shape of an add-to-cart style parameter ---------------------------

export interface ListParameter {
	/** The array parameter, e.g. `items`. */
	parameter: string;
	/** The string property of one entry that names the product. */
	nameField: string;
	/** The integer/number property of one entry that counts it, if there is one. */
	quantityField?: string;
}

type PropertySchema = {
	type?: string;
	items?: {
		type?: string;
		properties?: Record<string, { type?: string }>;
		required?: string[];
	};
};

/**
 * Finds a parameter shaped like a list of `{name-ish string, count}` objects in
 * a tool's schema — read from the schema alone, never from parameter names:
 * the entry's required string property (else its first string property) names
 * the thing, an integer/number property counts it. `undefined` when the tool
 * takes no such list (then it takes one thing per call).
 */
export function findListParameter(schema: {
	properties?: Record<string, unknown>;
}): ListParameter | undefined {
	for (const [parameter, raw] of Object.entries(schema.properties ?? {})) {
		const property = raw as PropertySchema;
		if (property.type !== "array" || property.items?.type !== "object") {
			continue;
		}
		const fields = Object.entries(property.items.properties ?? {});
		const strings = fields.filter(([, field]) => field.type === "string");
		const required = property.items.required ?? [];
		const nameField = (strings.find(([name]) => required.includes(name)) ??
			strings[0])?.[0];
		if (!nameField) continue;
		const quantityField = fields.find(
			([, field]) => field.type === "integer" || field.type === "number",
		)?.[0];
		return { parameter, nameField, quantityField };
	}
	return undefined;
}

/**
 * The array argument filled from the found list: one entry per found thing,
 * name and count in the fields `findListParameter` located. `undefined` when
 * the schema has no such parameter or nothing was found. With `single`, one
 * `product` fact counts as a found list of one.
 */
export function listArgument(
	state: WorldState,
	schema: { properties?: Record<string, unknown> },
	options: { single?: boolean } = {},
): { parameter: string; value: Record<string, unknown>[] } | undefined {
	const found = readItems(state, FOUND_ITEMS);
	// One product found by a plain search (`product`, `quantity` facts) fills
	// the list the same way.
	if (
		found.length === 0 &&
		options.single &&
		typeof state.product === "string"
	) {
		found.push({
			name: state.product,
			quantity: typeof state.quantity === "number" ? state.quantity : 1,
		});
	}
	const target = findListParameter(schema);
	if (found.length === 0 || !target) return undefined;
	return {
		parameter: target.parameter,
		value: found.map((item) => ({
			[target.nameField]: item.name,
			...(target.quantityField
				? { [target.quantityField]: item.quantity }
				: {}),
		})),
	};
}
