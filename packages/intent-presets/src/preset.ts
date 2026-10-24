/** Facts of the planner's world: a flat key to value bag (the same shape as core's `WorldState`). */
export type Facts = Record<string, string | number | boolean>;

/** One intent of a set: what it means (for Laya), what a tool of it needs and gives, and how it is guarded. */
export interface IntentDef {
	/** One short English line; Laya shares one 192-token budget between all options of a question. */
	description: string;
	/** Facts that must hold before a tool of this intent runs (the order of steps comes from these). */
	preconditions: Facts;
	/** Facts a tool of this intent most likely gives. */
	effects: Facts;
	/** Runs only on the visitor's own words (checkout, removal): never taken from a model. */
	needsWords?: boolean;
	/** A tool's role, not something a visitor asks for: never offered as a message intent. */
	toolRole?: boolean;
}

/**
 * Everything that makes a site's domain: one folder per preset (`shop/`, later
 * `shop-lighting/`, `shop-shoes/`), pure data and pure functions, no dependency
 * on core. A channel lists preset ids; later ones add to or override earlier ones.
 */
export interface IntentPreset {
	id: string;
	/** Facts that outlive one request (the store the visitor is in, the last product). */
	sessionFacts?: string[];
	intents: Record<string, IntentDef>;
	/** Word rules over a message (original or translated): an intent id, or `undefined` when no rule decides. */
	messageCues?: (message: string) => string | undefined;
	/** The intent of a tool from its name: an intent id, or `undefined` when the name decides nothing. */
	toolCues?: (tool: {
		name: string;
		description?: string;
	}) => string | undefined;
	/** Extra planner cost of a tool whose name is narrower than its intent's plain tool (`add_recipe_to_cart` next to `add_to_cart`). */
	specialistPenalty?: (name: string, intent: string) => number;
	/** Tasks of one message that must not run in a guessed order (see `tasksConflict`). */
	taskConflicts?: TaskConflicts;
}

/** Intent pairs that undo or depend on each other, and intents that only make sense as the last task. */
export interface TaskConflicts {
	pairs: [string, string][];
	lastOnly: string[];
}

/** Several presets merged: what the classifier, the planner and the guards read. */
export interface Taxonomy {
	/** The ids merged, in order. */
	presets: string[];
	intents: Record<string, IntentDef>;
	sessionFacts: string[];
	/** Later presets first: the most specific rule is asked first. */
	messageCues: NonNullable<IntentPreset["messageCues"]>[];
	toolCues: NonNullable<IntentPreset["toolCues"]>[];
	/** The latest preset's that has one; no extra cost otherwise. */
	specialistPenalty: NonNullable<IntentPreset["specialistPenalty"]>;
	/** The union of the presets'. */
	taskConflicts: TaskConflicts;
}

/** Later presets win: an intent they define replaces the earlier one whole; their rules are asked first. */
export function mergePresets(presets: IntentPreset[]): Taxonomy {
	const taxonomy: Taxonomy = {
		presets: presets.map((preset) => preset.id),
		intents: {},
		sessionFacts: [],
		messageCues: [],
		toolCues: [],
		specialistPenalty: () => 0,
		taskConflicts: { pairs: [], lastOnly: [] },
	};
	for (const preset of presets) {
		Object.assign(taxonomy.intents, preset.intents);
		for (const fact of preset.sessionFacts ?? []) {
			if (!taxonomy.sessionFacts.includes(fact))
				taxonomy.sessionFacts.push(fact);
		}
		if (preset.messageCues) taxonomy.messageCues.unshift(preset.messageCues);
		if (preset.toolCues) taxonomy.toolCues.unshift(preset.toolCues);
		if (preset.specialistPenalty)
			taxonomy.specialistPenalty = preset.specialistPenalty;
		if (preset.taskConflicts) {
			taxonomy.taskConflicts.pairs.push(...preset.taskConflicts.pairs);
			taxonomy.taskConflicts.lastOnly.push(...preset.taskConflicts.lastOnly);
		}
	}
	return taxonomy;
}

/** First rule that decides wins; the rules of later presets are asked first. */
export function intentFromMessageCues(
	taxonomy: Taxonomy,
	message: string,
): string | undefined {
	for (const cues of taxonomy.messageCues) {
		const found = cues(message);
		if (found !== undefined) return found;
	}
	return undefined;
}

export function intentFromToolNameCues(
	taxonomy: Taxonomy,
	tool: { name: string; description?: string },
): string | undefined {
	for (const cues of taxonomy.toolCues) {
		const found = cues(tool);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * Tasks of one message (intent ids in the order said) whose order matters: a
 * conflicting pair, or a `lastOnly` intent that is not last. Without an order
 * word in the message the caller must ask instead of guessing.
 */
export function tasksConflict(taxonomy: Taxonomy, intents: string[]): boolean {
	const { pairs, lastOnly } = taxonomy.taskConflicts;
	const has = (id: string) => intents.includes(id);
	return (
		pairs.some(([a, b]) => has(a) && has(b)) ||
		lastOnly.some((id) => intents.slice(0, -1).includes(id))
	);
}
