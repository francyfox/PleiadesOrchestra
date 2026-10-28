import type { ToolIntent } from "#core/goap/intent-taxonomy";
import type { GoapAction, WorldState } from "#core/goap/types";

/**
 * A site's tool often names its own options: `add_recipe_to_cart { recipe:
 * "Weeknight Beef Tacos" }`, `book_tickets { format: "IMAX Laser" }`,
 * `add_bundle_to_cart { bundle: "Home Office Starter Kit" }`. When the shopper's
 * message says one of those values, that tool is what they asked for: the value
 * is the argument already (no model needed), and the generic search → add
 * steps are not wanted (the plain `add_to_cart` would buy an ingredient, not
 * the recipe). Pure code on the tool's own schema; nothing here knows what a
 * recipe or a ticket is.
 *
 * Planning stays what it was: the tool action is built once per catalog, the
 * planner only sees costs and facts. So a match is written down as FACTS of this
 * request (`matchSpecialist`), and the cost follows from those facts
 * (`preferSpecialist`) — both again after a pause for a browser tool, because the
 * checkpoint keeps the facts.
 */

/** Names the matched tool; read by `preferSpecialist`. */
export const SPECIALIST_FACT = "specialistTool";

/** Facts that make the generic "find the item first" steps unnecessary (`PRECONDITIONS_BY_INTENT`). */
const SKIPPED_STEPS = { catalogSearched: true, requestParsed: true } as const;

/** Cost of a matched specialist: below any plain tool, which costs at least a tool call. */
const MATCHED_COST = 0.1;

/**
 * A value shorter than this (after normalizing) is not a phrase worth finding:
 * "2D", "hot", "IMAX" or "red" sit inside ordinary sentences. Six letters keeps
 * "IMAX Laser", "Tacos Kit", "Gaming Desk Combo".
 */
const MIN_VALUE_LENGTH = 6;

/** Lower case, letters and digits of any script, single spaces: «Beef-Tacos!» and "beef tacos" compare equal. */
function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

/** The longest of `values` that the text says as whole words, or `undefined`. */
export function matchEnumValue(
	text: string,
	values: readonly string[],
): string | undefined {
	const haystack = ` ${normalize(text)} `;
	let best: { value: string; length: number } | undefined;
	for (const value of values) {
		const needle = normalize(value);
		if (needle.length < MIN_VALUE_LENGTH) continue;
		if (!haystack.includes(` ${needle} `)) continue;
		if (!best || needle.length > best.length) {
			best = { value, length: needle.length };
		}
	}
	return best?.value;
}

interface SchemaLike {
	properties?: Record<string, unknown>;
}

/** String parameters with a fixed list of values, required or not. */
function enumParameters(
	schema: SchemaLike | undefined,
): { name: string; values: string[] }[] {
	const result: { name: string; values: string[] }[] = [];
	for (const [name, property] of Object.entries(schema?.properties ?? {})) {
		const values = ((property as { enum?: unknown[] })?.enum ?? []).filter(
			(value): value is string => typeof value === "string",
		);
		if (values.length > 0) {
			result.push({ name, values });
		}
	}
	return result;
}

/** What the shopper said, in both its forms: the catalog's values are in the catalog's language. */
function messageTexts(state: WorldState): string[] {
	return [state.userMessage, state.userMessageEn].filter(
		(text): text is string => typeof text === "string" && text !== "",
	);
}

/**
 * The hook of one tool action (`GoapAction.bindToRequest`): does this request
 * name one of the tool's enum values? Only for a request of the tool's own
 * intent — "what is in the Streaming Setup Pro?" is a question, not a purchase.
 */
export function bindEnumValues(
	tool: { inputSchema?: SchemaLike },
	intent: ToolIntent,
	flagFor: (parameter: string) => string,
): NonNullable<GoapAction["bindToRequest"]> {
	const parameters = enumParameters(tool.inputSchema);
	return (state) => {
		if (parameters.length === 0 || state.messageIntent !== intent) {
			return undefined;
		}
		const texts = messageTexts(state);
		let best: { name: string; value: string; length: number } | undefined;
		for (const parameter of parameters) {
			for (const text of texts) {
				const value = matchEnumValue(text, parameter.values);
				const length = value ? normalize(value).length : 0;
				if (value && length > (best?.length ?? 0)) {
					best = {
						name: parameter.name,
						value,
						length,
					};
				}
			}
		}
		if (!best) return undefined;
		return {
			score: best.length,
			facts: {
				[best.name]: best.value,
				// The choice step of the enum has nothing left to decide.
				[flagFor(best.name)]: true,
			},
		};
	};
}

/**
 * The facts of a request that names one tool's option: which tool, the argument,
 * and "no search, no parsing needed". `undefined` when no tool is named. With
 * several matches the longest (most specific) phrase wins.
 */
export function matchSpecialist(
	actions: readonly GoapAction[],
	state: WorldState,
): Partial<WorldState> | undefined {
	let best:
		| { tool: string; score: number; facts: Partial<WorldState> }
		| undefined;
	for (const action of actions) {
		const hit = action.bindToRequest?.(state);
		if (hit && hit.score > (best?.score ?? 0)) {
			best = { tool: action.name, ...hit };
		}
	}
	if (!best) return undefined;
	return { ...SKIPPED_STEPS, ...best.facts, [SPECIALIST_FACT]: best.tool };
}

/**
 * The catalog for this request: the tool `matchSpecialist` found costs less than
 * every plain tool, so the planner takes it over `add_to_cart` (whose
 * `specialistPenalty` made it lose every tie). Returns copies; the shared
 * catalog entries stay untouched. Without the fact the actions are returned as
 * they were.
 */
export function preferSpecialist(
	actions: GoapAction[],
	state: WorldState,
): GoapAction[] {
	const name = state[SPECIALIST_FACT];
	if (typeof name !== "string") return actions;
	return actions.map((action) =>
		action.name === name
			? { ...action, cost: Math.min(action.cost, MATCHED_COST) }
			: action,
	);
}
