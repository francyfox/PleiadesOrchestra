import { en } from "./shop.cues.en.ts";
import { ru } from "./shop.cues.ru.ts";
import { composeCues } from "./shop.cues.ts";

/**
 * Lexical evidence for what a shopper's message asks for. Laya (a small typed-decision
 * model) understands English well (~88% on `INTENT_CASES`) and Russian badly (~55%): the
 * same «купи сыр» came back as `removeFromCart`, «оформи заказ» as `compare`. Verbs and
 * nouns of a shop are a small, stable vocabulary, so they are matched here first and Laya
 * only sorts what no rule claims. A rule must be something a person would also call
 * evidence — never a phrase fitted to one test message.
 *
 * One file per language (`shop.cues.<language>.ts`); to add one, write the file and list it
 * here. The order in which intents outrank each other is shared (`SLOTS` in `shop.cues.ts`).
 */
export const { intentFromCues, asksForAll } = composeCues([en, ru]);
