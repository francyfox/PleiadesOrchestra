import type { ToolIntent } from "./intent-taxonomy";
import { LISTED_ITEMS, REMOVED_ITEMS, SCOPE_ALL } from "./list-removal";
import {
	FOUND_ITEMS,
	findListParameter,
	MISSING_ITEMS,
	REQUESTED_ITEMS,
	readItems,
	writeItems,
} from "./shopping-list";
import type { WorldState } from "./types";
import { NO_RESULTS } from "./webmcp-steps";

// One WebMCP wait is one tool call, so a request for several things runs the
// same tool several times: call for thing i, wait, read the answer, call for
// thing i + 1. The cursor and what was learned so far travel as facts of the
// waiting run (`ActionResult.waiting.facts`), which is the checkpoint the
// resume starts from.

/** Where a fan-out of tool `tool` stands: the index of the call in flight. */
export const cursorFact = (tool: string) => `fanOut:${tool}`;

export interface FanOutStep {
	/** All calls are made: the facts to add, and whether the tool failed as a whole. */
	done: boolean;
	failed: boolean;
	facts: Partial<WorldState>;
}

export interface FanOut {
	/** Reads the answer to the call in flight; says what to do next. */
	advance(state: WorldState, answer: string): FanOutStep;
	/** The state the next call's arguments are built from. */
	callState(state: WorldState, carried: Partial<WorldState>): WorldState;
}

const asNumber = (value: unknown) => (typeof value === "number" ? value : 0);

/**
 * Several searches: one per requested thing. Found names are kept (with the
 * requested count), things the site had nothing for are remembered as missing.
 * With no usable hit at all the search failed as a whole.
 */
function searchEach(
	tool: string,
	requested: ReturnType<typeof readItems>,
	firstProduct: (text: string) => string | undefined,
): FanOut {
	return {
		advance(state, answer) {
			const cursor = asNumber(state[cursorFact(tool)]);
			const asked = requested[cursor];
			const found = readItems(state, FOUND_ITEMS);
			const missing = readItems(state, MISSING_ITEMS);
			if (asked) {
				const product = firstProduct(answer);
				if (product) found.push({ name: product, quantity: asked.quantity });
				else if (NO_RESULTS.test(answer)) missing.push(asked);
				// An answer in a format this cannot read: the query stands in for
				// the name and the site's own matching decides (as for one search).
				else found.push({ name: asked.name, quantity: asked.quantity });
			}
			const next = requested[cursor + 1];
			if (next) {
				return {
					done: false,
					failed: false,
					facts: {
						[FOUND_ITEMS]: writeItems(found),
						[MISSING_ITEMS]: writeItems(missing),
						[cursorFact(tool)]: cursor + 1,
						query: next.name,
						quantity: next.quantity,
					},
				};
			}
			const first = found[0];
			// The cursor stays past the end: asked again with the same stale
			// answer (a replan after a failed search), this step ends the same way.
			const settled = {
				[cursorFact(tool)]: requested.length,
				[FOUND_ITEMS]: writeItems(found),
				[MISSING_ITEMS]: writeItems(missing),
				query: requested[0]?.name,
				quantity: requested[0]?.quantity,
			};
			return first
				? {
						done: true,
						failed: false,
						facts: {
							...settled,
							product: first.name,
							lastProduct: first.name,
							quantity: first.quantity,
						},
					}
				: { done: true, failed: true, facts: { ...settled, lastProduct: "" } };
		},
		callState(state, carried) {
			const cursor = asNumber(
				carried[cursorFact(tool)] ?? state[cursorFact(tool)],
			);
			const asked = requested[cursor];
			// The small model reads this one thing, not the whole message.
			return {
				...state,
				...carried,
				...(asked ? { userMessageEn: asked.name } : {}),
			};
		},
	};
}

/** A tool that adds ONE thing per call, run once for each found thing. */
function addEach(tool: string, found: ReturnType<typeof readItems>): FanOut {
	return {
		advance(state) {
			const cursor = asNumber(state[cursorFact(tool)]);
			const next = found[cursor + 1];
			if (next) {
				return {
					done: false,
					failed: false,
					facts: {
						[cursorFact(tool)]: cursor + 1,
						product: next.name,
						quantity: next.quantity,
					},
				};
			}
			return {
				done: true,
				failed: false,
				facts: {
					[cursorFact(tool)]: found.length,
					product: found[0]?.name,
					quantity: found[0]?.quantity,
				},
			};
		},
		callState(state, carried) {
			return { ...state, ...carried };
		},
	};
}

/**
 * A tool that removes ONE thing per call, run once for each thing a reading tool
 * listed (`list-removal.ts`). The arguments are built from the item at the cursor
 * by the caller; what is removed is reported when the last call is answered.
 */
function removeEach(
	tool: string,
	listed: ReturnType<typeof readItems>,
): FanOut {
	return {
		advance(state) {
			const cursor = asNumber(state[cursorFact(tool)]);
			if (listed[cursor + 1]) {
				return {
					done: false,
					failed: false,
					facts: { [cursorFact(tool)]: cursor + 1 },
				};
			}
			return {
				done: true,
				failed: false,
				facts: {
					[cursorFact(tool)]: listed.length,
					[REMOVED_ITEMS]: writeItems(listed),
				},
			};
		},
		callState(state, carried) {
			return { ...state, ...carried };
		},
	};
}

/**
 * Whether this call of `tool` is one of several, and how to step through them:
 * a search tool with more than one requested thing, or an add tool that takes
 * one product per call (no list parameter in its schema) with more than one
 * found thing. An add tool WITH a list parameter takes everything in one call
 * (`buildArguments`) and is not a fan-out.
 */
export function fanOutFor(
	tool: {
		name: string;
		inputSchema?: { properties?: Record<string, unknown> };
	},
	intent: ToolIntent,
	state: WorldState,
	firstProduct: (text: string) => string | undefined,
): FanOut | undefined {
	if (intent === "search") {
		const requested = readItems(state, REQUESTED_ITEMS);
		return requested.length > 1
			? searchEach(tool.name, requested, firstProduct)
			: undefined;
	}
	if (intent === "addToCart") {
		const found = readItems(state, FOUND_ITEMS);
		return found.length > 1 && !findListParameter(tool.inputSchema ?? {})
			? addEach(tool.name, found)
			: undefined;
	}
	if (intent === "removeFromCart" && state[SCOPE_ALL] === true) {
		const listed = readItems(state, LISTED_ITEMS);
		return listed.length > 0 && !findListParameter(tool.inputSchema ?? {})
			? removeEach(tool.name, listed)
			: undefined;
	}
	return undefined;
}
