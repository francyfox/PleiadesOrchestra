import type { IntentPreset } from "../preset.ts";
import { SHOP_INTENTS } from "./shop.intents.ts";
import { intentFromCues } from "./shop.message-cues.ts";
import { intentFromToolCues, specialistPenalty } from "./shop.tool-cues.ts";

/**
 * Facts that stay true between turns of one conversation: the store the
 * shopper is in, and the product the last search found (`lastProduct`, empty
 * after a failed one) — so «now buy them» needs no second search. Everything
 * else a run produces (`catalogSearched`, `inCart`, tool results, the reply
 * text) belongs to that one request and is dropped when it ends.
 */
const SESSION_FACTS = ["storeOpen", "store", "lastProduct"];

/** Any online shop: groceries, lamps, shoes. Specific assortments add presets on top of it. */
export const shop: IntentPreset = {
	id: "shop",
	sessionFacts: SESSION_FACTS,
	intents: SHOP_INTENTS,
	messageCues: intentFromCues,
	toolCues: intentFromToolCues,
	specialistPenalty,
};
