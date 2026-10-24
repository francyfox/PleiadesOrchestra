import { type IntentPreset, mergePresets, type Taxonomy } from "./preset.ts";
import { shop } from "./shop/shop.ts";

export type {
	Facts,
	IntentDef,
	IntentPreset,
	TaskConflicts,
	Taxonomy,
} from "./preset.ts";
export {
	intentFromMessageCues,
	intentFromToolNameCues,
	mergePresets,
	tasksConflict,
} from "./preset.ts";
// The shop's own functions, for the callers that run without a channel taxonomy (evals, tests).
export { asksForAll, intentFromCues } from "./shop/shop.message-cues.ts";
export {
	intentFromToolCues,
	specialistPenalty,
	tokens,
} from "./shop/shop.tool-cues.ts";

/**
 * Every preset that ships, by id. Adding one: a folder next to `shop/` with a
 * file that exports an `IntentPreset`, and one line here. The admin lists
 * channels' choices from this, so nothing else needs to know about it.
 */
export const PRESETS: Record<string, IntentPreset> = { shop };

export type { PresetId } from "./ids.ts";
export { PRESET_IDS, PRESET_LIST } from "./ids.ts";

/** The taxonomy of a channel's preset ids, in order; an id that does not exist is skipped (a preset removed later). */
export function resolveTaxonomy(ids: readonly string[]): Taxonomy {
	return mergePresets(ids.flatMap((id) => (PRESETS[id] ? [PRESETS[id]] : [])));
}

/** What a channel with no set runs with where a taxonomy is still needed: the shop one. */
export const SHOP_TAXONOMY: Taxonomy = resolveTaxonomy(["shop"]);

/** Every fact that any preset keeps between turns: what survives a run when the run is not tied to one channel's presets. */
export const ALL_SESSION_FACTS: string[] = [
	...new Set(
		Object.values(PRESETS).flatMap((preset) => preset.sessionFacts ?? []),
	),
];

/** Every intent id of any preset, plus `chat`: what an intent example may be labelled with. */
export const ALL_INTENT_IDS: string[] = [
	"chat",
	...new Set(
		Object.values(PRESETS).flatMap((preset) => Object.keys(preset.intents)),
	),
];
