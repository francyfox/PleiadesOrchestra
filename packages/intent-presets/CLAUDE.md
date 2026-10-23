# @repo/intent-presets internals

See root `CLAUDE.md` for monorepo commands and style.

Pure data and functions, no dependency on core: the **intent presets** a channel can use. A preset is everything that makes a site's domain (`shop/`: the intents with their descriptions, `preconditions`/`effects`, guarded ones (`needsWords`), the word rules over a message, the tool-name rules, the specialist penalty). `core` takes the merged result (`Taxonomy`) as a parameter and defaults to the shop one; the orchestrator resolves a channel's preset ids with `resolveTaxonomy(ids)`.

- `preset.ts` — `IntentPreset`, `Taxonomy`, `mergePresets` (a later preset replaces an intent whole, adds its own; its rules are asked first; session facts are the union), `intentFromMessageCues`, `intentFromToolNameCues`.
- `shop/` — `shop.intents.ts` (data), `shop.cues.ts` (the shared part: the order of the slots, who outranks whom, and the matching), `shop.cues.en.ts` / `shop.cues.ru.ts` (the word rules, one file per language), `shop.message-cues.ts` (lists the languages in use; `intentFromCues`, `asksForAll`), `shop.tool-cues.ts` (verbs of a tool name; `tokens`, `specialistPenalty`), `shop.ts` (the `IntentPreset`).
- `index.ts` — the registry `PRESETS`, `resolveTaxonomy`, `SHOP_TAXONOMY`, `ALL_SESSION_FACTS`, `ALL_INTENT_IDS`. `ids.ts` (export `./ids`) — the light list `PRESET_LIST` (`id`, `file`) the admin imports in a browser without the word rules.

**Adding a language** to the shop's word rules: `shop.cues.<code>.ts` exporting a `LanguageCues` (patterns per slot, any slot may be left out; `normalize`/`normalizePattern` if the language folds letters) and one name in the list in `shop.message-cues.ts`. A language only adds patterns; the order of the slots is shared.

**Adding a preset** (`shop-lighting`, `shop-shoes`, a booking site): a folder next to `shop/` exporting an `IntentPreset` (only what differs from the presets before it), one line in `PRESETS` (`index.ts`), one line in `PRESET_LIST` (`ids.ts`), a localized description in the admin's `intents.content.ts`. `index.test.ts` fails when the two lists differ or a file is missing.

Not here yet (still in `packages/core/src/goap`, keyed by the shop's intent ids): the step texts (`webmcp-steps.ts`, they use planner types), the request parser (`product-request.ts`: «buy 2 cheeses»), `specialist.ts`, `fan-out.ts`. A preset with other ids simply does not trigger them. Move them in when a second preset needs its own.

Tests: `bun --cwd packages/intent-presets test`. The shop's word rules are tested in core (`message-cues.test.ts`, `tool-cues.test.ts`: they use core's `INTENT_CASES`).
