import type { DecisionAgent } from "../decision-types";
import {
	EFFECTS_BY_INTENT,
	TOOL_INTENTS,
	type ToolIntent,
} from "./intent-taxonomy";
import type { GoapAction, WorldState } from "./types";

export type MessageIntent = "chat" | ToolIntent;

const MESSAGE_INTENTS: readonly MessageIntent[] = ["chat", ...TOOL_INTENTS];

export interface ClassifyMessageIntentConfig {
	decisionAgent: DecisionAgent;
}

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
): Promise<MessageIntent> {
	const answers = await config.decisionAgent.decide(
		{ message },
		{
			intent: {
				type: "choice",
				instructions:
					"Is the user just chatting, or asking to do something that needs " +
					"searching, filtering, selecting, adding/removing something from a " +
					"cart, checking out, paging through results, or comparing options? " +
					"Pick the single closest match; when unsure, pick chat.",
				criteria: [...MESSAGE_INTENTS],
			},
		},
	);
	const answer = answers.intent;
	const choice = answer?.type === "choice" ? answer.choice : undefined;
	return choice && (MESSAGE_INTENTS as readonly string[]).includes(choice)
		? (choice as MessageIntent)
		: "chat";
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
