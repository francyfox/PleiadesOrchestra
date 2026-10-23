// The ids of the presets that ship and where each is defined: all a browser needs (the admin's channel form
// and its list of sets), without the word rules and the rest of the code. `index.test.ts` checks this list
// against the registry in `index.ts`, so adding a preset is: a folder, a line in `index.ts`, a line here.
export const PRESET_LIST = [
	{ id: "shop", file: "packages/intent-presets/src/shop/shop.ts" },
] as const;

export type PresetId = (typeof PRESET_LIST)[number]["id"];

export const PRESET_IDS: readonly PresetId[] = PRESET_LIST.map(
	(preset) => preset.id,
);
