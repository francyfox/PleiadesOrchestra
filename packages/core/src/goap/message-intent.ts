import type { DecisionAgent } from "../decision-types";
import {
	EFFECTS_BY_INTENT,
	INTENT_DESCRIPTIONS,
	TOOL_INTENTS,
	type ToolIntent,
} from "./intent-taxonomy";
import { intentFromCues } from "./message-cues";
import type { GoapAction, WorldState } from "./types";

export type MessageIntent = "chat" | ToolIntent;

const MESSAGE_INTENTS: readonly MessageIntent[] = ["chat", ...TOOL_INTENTS];

export interface ClassifyMessageIntentConfig {
	decisionAgent: DecisionAgent;
	/** `false` skips the lexical cues and asks Laya for everything — only to measure Laya alone (`bun run eval:intents`). */
	cues?: boolean;
}

/** Intents with a side effect the shopper must have asked for in so many words. */
const NEEDS_THE_WORDS: ReadonlySet<MessageIntent> = new Set([
	"checkout",
	"removeFromCart",
]);

/**
 * One cheap Laya `choice` call that decides whether a turn needs the WebMCP/
 * MCP tool catalog at all — "привет" vs "подбери ингредиенты для яишницы".
 * Deliberately **not** a `GoapAction`: `plan()`'s backward chaining matches
 * on an action's *static* declared `effects` (see `plan.ts`), but this call
 * picks between many different possible outcomes for the same question, so
 * its result has to shape the `goal` passed into `runPlan` itself, not
 * become one more node inside the graph it produces — same reasoning as the
 * rejected-autopilot section in docs/laya-autonomous-webmcp.md, one level up
 * (message routing instead of tool dispatch).
 */
export async function classifyMessageIntent(
	config: ClassifyMessageIntentConfig,
	message: string,
	/** The message translated to English, when it wasn't English: Laya reads that. */
	english?: string,
): Promise<MessageIntent> {
	// The words of the original first (they were written for it, and a
	// translation can lose them: «оформи заказ» → "Order"), then the words of
	// the translation; Laya only for what neither says.
	const byWords =
		config.cues === false
			? undefined
			: (intentFromCues(message) ??
				(english ? intentFromCues(english) : undefined));
	if (byWords) return byWords;

	// Only the message goes to Laya. The visitor's page and language used to go
	// along, and Laya let them outweigh the message: "привет" came back as
	// `navigate`, «купи 1 сыр» as `checkout` (measured, docs/laya-autonomous-webmcp.md).
	// "Already on that page" is handled where the page is known (`samePage`).
	const answers = await config.decisionAgent.decide(
		{ message: english ?? message },
		{
			intent: {
				type: "choice",
				instructions:
					"Is the user just chatting, or asking to do something in an online " +
					"shop? Pick the single closest match; when unsure, pick chat.",
				criteria: {
					chat: 'greeting, thanks, small talk, or a question that has nothing to do with shopping ("hi", "thanks", "how are you", "what is the weather")',
					...INTENT_DESCRIPTIONS,
				},
			},
		},
	);
	const answer = answers.intent;
	const choice = answer?.type === "choice" ? answer.choice : undefined;
	if (!choice || !(MESSAGE_INTENTS as readonly string[]).includes(choice)) {
		return "chat";
	}
	// Laya was measured to call «оформи заказ» `compare` and «удали сыр»
	// `addToCart`; paying or emptying the cart by mistake is not recoverable by
	// a replan, so those two are only ever taken from the words themselves.
	return NEEDS_THE_WORDS.has(choice as MessageIntent)
		? "chat"
		: (choice as MessageIntent);
}

/**
 * Extends `baseGoal` with the classified intent's usual effects — but only
 * the ones some action in `actions` can actually produce. A thread with no
 * WebMCP/MCP catalog bound to it yet (`threadActionsFor` returning nothing,
 * still the common case — see docs/laya-autonomous-webmcp.md) has no action
 * producing e.g. `inCart`, so a `"addToCart"`-classified message degrades
 * back to `baseGoal` alone instead of demanding a fact nothing can supply,
 * which `plan()` would otherwise fail outright to reach.
 */
export function goalForIntent(
	intent: MessageIntent,
	baseGoal: Partial<WorldState>,
	actions: GoapAction[],
): Partial<WorldState> {
	if (intent === "chat") return baseGoal;

	const producible = new Set(
		actions.flatMap((action) => Object.keys(action.effects)),
	);
	const extra = Object.entries(EFFECTS_BY_INTENT[intent]).filter(([key]) =>
		producible.has(key),
	);
	return extra.length > 0
		? { ...baseGoal, ...Object.fromEntries(extra) }
		: baseGoal;
}
