import type { DecisionAgent } from "../decision-types";
import type { IntentHit } from "./intent-memory";
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

/** Where an intent came from — shown in the admin's graph, and what decides whether to learn from it. */
export type IntentSource = "words" | "memory" | "laya" | "fallback";

export interface IntentVerdict {
	intent: MessageIntent;
	source: IntentSource;
	/** Memory's own confidence; Laya's is saturated (1.00 even when wrong) and not reported. */
	confidence?: number;
}

export interface ClassifyMessageIntentConfig {
	decisionAgent: DecisionAgent;
	/**
	 * `all` (default): every word rule is taken first, then Laya. `guarded`:
	 * only the words of checkout and removal are rules — everything else goes to
	 * the site's memory and then Laya, so a new shop needs no hand-written words.
	 */
	rules?: "all" | "guarded";
	/** What this site has been taught (approved examples): asked about the English text before Laya. */
	memory?: (text: string) => IntentHit | undefined;
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
	return (await classifyMessageIntentDetailed(config, message, english)).intent;
}

/** The words of the original first (a translation can lose them: «оформи заказ» → "Order"), then of the translation. */
function intentByWords(
	config: ClassifyMessageIntentConfig,
	message: string,
	english: string | undefined,
): MessageIntent | undefined {
	if (config.cues === false) return undefined;
	const found =
		intentFromCues(message) ?? (english ? intentFromCues(english) : undefined);
	// Guarded: the words only decide what must never come from a model.
	return config.rules === "guarded" && found && !NEEDS_THE_WORDS.has(found)
		? undefined
		: found;
}

/**
 * Same decision as `classifyMessageIntent`, with where it came from: the
 * words, the site's memory, Laya, or the fallback after Laya failed.
 * Order: words (all of them, or only the dangerous two when `rules` is
 * `guarded`) → memory → Laya on the English text → chat.
 */
export async function classifyMessageIntentDetailed(
	config: ClassifyMessageIntentConfig,
	message: string,
	english?: string,
): Promise<IntentVerdict> {
	const byWords = intentByWords(config, message, english);
	if (byWords) return { intent: byWords, source: "words" };

	const remembered = config.memory?.(english ?? message);
	if (remembered) {
		return {
			intent: remembered.intent,
			source: "memory",
			confidence: remembered.confidence,
		};
	}

	// Only the message goes to Laya. The visitor's page and language used to go
	// along, and Laya let them outweigh the message: "привет" came back as
	// `navigate`, «купи 1 сыр» as `checkout` (measured, docs/laya-autonomous-webmcp.md).
	// "Already on that page" is handled where the page is known (`samePage`).
	let answers: Awaited<ReturnType<DecisionAgent["decide"]>>;
	try {
		answers = await config.decisionAgent.decide(
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
	} catch {
		// Laya being down must not lose the message: whatever the words say, else chat.
		const rescue =
			config.cues === false
				? undefined
				: (intentFromCues(message) ??
					(english ? intentFromCues(english) : undefined));
		return { intent: rescue ?? "chat", source: "fallback" };
	}
	const answer = answers.intent;
	const choice = answer?.type === "choice" ? answer.choice : undefined;
	if (!choice || !(MESSAGE_INTENTS as readonly string[]).includes(choice)) {
		return { intent: "chat", source: "laya" };
	}
	// Laya was measured to call «оформи заказ» `compare` and «удали сыр»
	// `addToCart`; paying or emptying the cart by mistake is not recoverable by
	// a replan, so those two are only ever taken from the words themselves.
	return {
		intent: NEEDS_THE_WORDS.has(choice as MessageIntent)
			? "chat"
			: (choice as MessageIntent),
		source: "laya",
	};
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
