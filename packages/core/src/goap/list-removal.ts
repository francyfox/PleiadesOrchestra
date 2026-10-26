import { asksForAll, tokens } from "@repo/intent-presets";
import type { ListItem } from "./shopping-list";
import { findListParameter } from "./shopping-list";
import type { GoapAction, WorldState } from "./types";

// «Remove everything» is the same fan-out as «buy A, B, C», only the list does
// not come from the message but from a tool's answer: a tool that reads the
// current list (get_cart, list_bookings) → every item it shows → the removing
// tool once per item (`fan-out.ts`). Nothing here knows what a cart is: the
// reader and the remover are found by their intents, the argument fields by
// the remover's schema.

/** The request is for every item of a list («all», «everything», «всё»). Set by `scopeFacts`. */
export const SCOPE_ALL = "scopeAll";
/** A list-reading tool answered (its effect). */
export const LIST_READ = "listRead";
/** The list-reading tool said the list is empty. */
export const LIST_EMPTY = "listEmpty";
/** What the reading tool listed: `name` = the item as the site shows it. */
export const LISTED_ITEMS = "listedItems";
/** What the removing tool took out, for the reply. */
export const REMOVED_ITEMS = "removedItems";

// --- reading a list out of a tool's answer ---------------------------------

/** A bulleted/numbered line, or a bare «2 × Name» line. */
export const LIST_ITEM =
	/^\s*(?:(?:[-*•]|\d+[.)])\s+(.+)|(\d+\s*[×xх]\s+.+))$/u;
export const NAME_END = /\s+[—–-]\s+|\s+\(|\s+\$\d/;
export const OUT_OF_STOCK = /out of stock|unavailable|sold out/i;

const nameWords = (text: string) =>
	text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

/**
 * The out-of-stock product a search answer lists that `query` names in full
 * (every word of its name is in the query): the visitor asked for exactly
 * that, so the next in-stock line is a different product, not a stand-in.
 * A broad query («keyboard») never names «Old Keyboard» and keeps the skip.
 */
export function outOfStockNamed(
	text: string,
	query: string,
): string | undefined {
	const asked = new Set(nameWords(query));
	for (const line of text.split("\n")) {
		const item = line.match(LIST_ITEM)?.[1];
		if (!item || !OUT_OF_STOCK.test(item)) continue;
		const name = item.split(NAME_END)[0]?.trim() ?? "";
		const words = nameWords(name);
		if (words.length > 0 && words.every((word) => asked.has(word))) return name;
	}
	return undefined;
}

const LEADING_COUNT = /^(\d+)\s*[×xх*]\s+/iu;
const LEADING_ID = /^#([\p{L}\p{N}][\p{L}\p{N}_-]*)/u;

/**
 * Every item of a listing answer: «- 2 × Tomatoes (1 lb) — $5.98» is
 * `{name: "Tomatoes", quantity: 2}`. A leading `#A12` names the entry by that
 * id (a site that lists bookings by number). Free text, so a heuristic: a
 * format this cannot read gives no items.
 */
export function parseListedItems(text: string): ListItem[] {
	const items: ListItem[] = [];
	for (const line of text.split("\n")) {
		const raw = line.match(LIST_ITEM);
		let item = (raw?.[1] ?? raw?.[2])?.trim();
		if (!item) continue;
		const id = item.match(LEADING_ID)?.[1];
		if (id) {
			items.push({ name: id, quantity: 1 });
			continue;
		}
		let quantity = 1;
		const count = item.match(LEADING_COUNT);
		if (count) {
			quantity = Number(count[1]);
			item = item.slice(count[0].length);
		}
		const name = item.split(NAME_END)[0]?.trim();
		if (name) items.push({ name, quantity });
	}
	return items;
}

/** «2 × Tomatoes on the Vine» anywhere in a sentence, up to the next separator. */
const COUNTED = /(\d+)\s*[×xх]\s+([^;\n,]+)/giu;

/**
 * Every «N × Name» of an answer written as prose, not as a list («Added: 1 ×
 * Spaghetti (…); 2 × Tomatoes on the Vine (…)»): what a tool that picks the
 * items itself (a recipe, a bundle) actually put in. Size, price and notes
 * after the name are cut like in `parseListedItems`.
 */
export function countedItems(text: string): ListItem[] {
	const items: ListItem[] = [];
	for (const match of text.matchAll(COUNTED)) {
		const name = match[2]?.split(NAME_END)[0]?.trim();
		if (name) items.push({ name, quantity: Number(match[1]) });
	}
	return items;
}

/** An answer that says the list has nothing in it. */
const EMPTY_ANSWER =
	/\b(?:is|are)\s+empty\b|\bno\s+(?:items?|bookings?|entries|results)\b|\bnothing\s+(?:in|here|yet)\b|\b0\s+items?\b|пуст/i;

export function looksEmpty(text: string): boolean {
	return EMPTY_ANSWER.test(text);
}

// --- the remover's arguments, from its schema ------------------------------

interface SchemaLike {
	type?: string;
	properties?: Record<string, unknown>;
	required?: string[];
}
interface PropertyLike {
	type?: string;
	minimum?: number;
	description?: string;
}

/** The description says that the value 0 takes the thing away. */
const ZERO_REMOVES =
	/\b0\b[^.]*\b(?:remov|delet|cancel|clear)|\b(?:remov|delet|cancel|clear)[^.]*\b0\b/i;

const isNumber = (property: PropertyLike) =>
	property.type === "integer" || property.type === "number";

/**
 * The number that removes at 0: a numeric parameter whose description says so
 * («0 removes it»), else a required one with `minimum: 0`. `undefined` when the
 * tool has no such switch (it removes by being called).
 */
export function findZeroField(schema: SchemaLike): string | undefined {
	const numeric = Object.entries(schema.properties ?? {}).filter(
		([, property]) => isNumber(property as PropertyLike),
	) as [string, PropertyLike][];
	const described = numeric.find(([, p]) =>
		ZERO_REMOVES.test(p.description ?? ""),
	);
	if (described) return described[0];
	return numeric.find(
		([name, p]) => p.minimum === 0 && (schema.required ?? []).includes(name),
	)?.[0];
}

/** A tool whose schema says that 0 removes: an edit tool that is really a remover. */
export function removesAtZero(tool: { inputSchema?: SchemaLike }): boolean {
	const schema = tool.inputSchema;
	if (!schema) return false;
	const field = findZeroField(schema);
	if (!field) return false;
	const property = schema.properties?.[field] as PropertyLike;
	return ZERO_REMOVES.test(property.description ?? "");
}

/** The string parameter that names the item: the required one, else the first. */
function nameField(schema: SchemaLike): string | undefined {
	const strings = Object.entries(schema.properties ?? {}).filter(
		([, property]) => (property as PropertyLike).type === "string",
	);
	return (strings.find(([name]) => (schema.required ?? []).includes(name)) ??
		strings[0])?.[0];
}

/**
 * The arguments that remove `items` through a tool with this schema, from the
 * schema alone: a list parameter takes every item (`findListParameter`),
 * otherwise the name goes into the string parameter and the removing number is
 * set to 0 (a remove tool with only a name gets only the name). `undefined`
 * when the schema has nowhere to put a name.
 */
export function removalArguments(
	schema: SchemaLike,
	items: ListItem[],
): Record<string, unknown> | undefined {
	if (items.length === 0) return undefined;
	const list = findListParameter(schema);
	if (list) {
		const listSchema = schema.properties?.[list.parameter] as {
			items?: { properties?: Record<string, PropertyLike> };
		};
		const entry = listSchema.items?.properties?.[list.quantityField ?? ""];
		const zero = list.quantityField && entry?.minimum === 0;
		return {
			[list.parameter]: items.map((item) => ({
				[list.nameField]: item.name,
				...(zero && list.quantityField ? { [list.quantityField]: 0 } : {}),
			})),
		};
	}
	const field = nameField(schema);
	if (!field) return undefined;
	const zero = findZeroField(schema);
	return {
		[field]: (items[0] as ListItem).name,
		...(zero ? { [zero]: 0 } : {}),
	};
}

// --- binding the scope to a request ----------------------------------------

/** The request-level fact «every item»: only for a removal that says so. */
export function scopeFacts(state: WorldState): Partial<WorldState> | undefined {
	if (state.messageIntent !== "removeFromCart") return undefined;
	const texts = [state.userMessage, state.userMessageEn];
	return texts.some((text) => typeof text === "string" && asksForAll(text))
		? { [SCOPE_ALL]: true }
		: undefined;
}

const singular = (word: string) => word.replace(/s$/, "");

/** Words two tool names share («get_cart» / «update_cart_item» → cart). */
function sharedWords(a: string, b: string): number {
	const other = new Set(tokens(b).map(singular));
	return tokens(a).filter((word) => other.has(singular(word))).length;
}

/**
 * The catalog for a request about every item: a remover that needs an item
 * waits for the list to be read (`scopedPreconditions`), and of several tools
 * that read, only those named closest to a remover stay readers (`get_cart`
 * next to `update_cart_item`, not `get_staples`). A remover that needs no item
 * (`clear_cart`) is untouched and wins by cost. Copies; without the scope, or
 * without any reader on the site, the actions come back as they were.
 */
export function bindListScope(
	actions: GoapAction[],
	state: WorldState,
): GoapAction[] {
	if (state[SCOPE_ALL] !== true) return actions;
	const readers = actions.filter(
		(action) => action.effects[LIST_READ] === true,
	);
	const removers = actions.filter((action) => action.scopedPreconditions);
	if (readers.length === 0 || removers.length === 0) return actions;
	const score = (reader: GoapAction) =>
		Math.max(...removers.map((r) => sharedWords(reader.name, r.name)));
	const best = Math.max(...readers.map(score));
	return actions.map((action) => {
		if (action.scopedPreconditions) {
			return {
				...action,
				preconditions: {
					...action.preconditions,
					...action.scopedPreconditions,
				},
			};
		}
		if (readers.includes(action) && score(action) < best) {
			const { [LIST_READ]: _unused, ...effects } = action.effects;
			return { ...action, effects };
		}
		return action;
	});
}
