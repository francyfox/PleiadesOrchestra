import { SHOP_TAXONOMY, type Taxonomy } from "@repo/intent-presets";
import type { WorldState } from "./types";

/**
 * What the classifier, the planner and the guards read about intents. The data
 * lives in `@repo/intent-presets` (one folder per preset); a channel's presets
 * merge into a `Taxonomy`, and every function here takes one, defaulting to the
 * shop. Two Laya classification points share it (see
 * apps/docs/content/en/drafts/laya-autonomous-webmcp.md): per tool, at
 * catalog-build time (`createWebMcpActions`), and per message, before planning
 * (`message-intent.ts`). Both need the same bounded set of options for Laya's
 * `choice` question — keeping it in one place is what keeps them in sync.
 */
export type { Taxonomy };

/** An intent id. A string, because the presets of a channel define them. */
export type ToolIntent = string;

const DEFAULT: Taxonomy = SHOP_TAXONOMY;

export const intentIds = (taxonomy: Taxonomy = DEFAULT): string[] =>
	Object.keys(taxonomy.intents);

/** The facts a tool of this intent most likely gives (empty for an intent the taxonomy lacks). */
export const effectsOf = (
	intent: ToolIntent,
	taxonomy: Taxonomy = DEFAULT,
): Partial<WorldState> => taxonomy.intents[intent]?.effects ?? {};

/** The facts a tool of this intent needs first. */
export const preconditionsOf = (
	intent: ToolIntent,
	taxonomy: Taxonomy = DEFAULT,
): Partial<WorldState> => taxonomy.intents[intent]?.preconditions ?? {};

/** Intents with a side effect the visitor must have asked for in so many words. */
export const needsTheWords = (taxonomy: Taxonomy = DEFAULT): Set<string> =>
	new Set(
		Object.entries(taxonomy.intents)
			.filter(([, def]) => def.needsWords)
			.map(([id]) => id),
	);

/**
 * What Laya may choose from, for a tool and for a message: one short line per
 * intent. `toolRole` intents are left out (a tool's role, recognised by its name;
 * a visitor never asks for it, and one more option only gave a 1B classifier one
 * more way to be wrong). Shared Laya budget: see `choice-rounds.ts`.
 */
export const layaDescriptions = (
	taxonomy: Taxonomy = DEFAULT,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(taxonomy.intents)
			.filter(([, def]) => !def.toolRole)
			.map(([id, def]) => [id, def.description]),
	);

/** What delta may split a message into: every intent, `toolRole` ones too («show me the cart» is a read). */
export const decompositionDescriptions = (
	taxonomy: Taxonomy = DEFAULT,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(taxonomy.intents).map(([id, def]) => [id, def.description]),
	);

// The shop's views, for the callers that run without a channel taxonomy (evals, tests, the default).
export const TOOL_INTENTS: readonly ToolIntent[] = intentIds();
export const INTENT_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
	Object.entries(DEFAULT.intents).map(([id, def]) => [id, def.description]),
);
export const LAYA_INTENT_DESCRIPTIONS = layaDescriptions();
export const EFFECTS_BY_INTENT: Record<
	string,
	Partial<WorldState>
> = Object.fromEntries(
	Object.entries(DEFAULT.intents).map(([id, def]) => [id, def.effects]),
);
export const PRECONDITIONS_BY_INTENT: Record<
	string,
	Partial<WorldState>
> = Object.fromEntries(
	Object.entries(DEFAULT.intents).map(([id, def]) => [id, def.preconditions]),
);
export const SESSION_FACTS: readonly string[] = DEFAULT.sessionFacts;
