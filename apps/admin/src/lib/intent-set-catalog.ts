import { PRESET_LIST, type PresetId } from "@repo/intent-presets/ids";

// The intent sets the orchestrator ships, from the presets package: the id (the name) and the file that
// defines it (the card links to it, no line). Descriptions are localized in the `intents` content.
export interface IntentSetEntry {
	id: PresetId;
	file: string;
}

export const INTENT_SET_CATALOG: readonly IntentSetEntry[] = PRESET_LIST;

const REPO = "https://github.com/francyfox/PleiadesOrchestra/blob/master";

export const intentSetCodeUrl = ({ file }: IntentSetEntry) => `${REPO}/${file}`;
