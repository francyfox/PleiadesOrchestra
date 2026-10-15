/**
 * Live accuracy of `classifyMessageIntent` against gamma-decision (Laya):
 *   bun run eval:intents               # summary
 *   bun run eval:intents -- --misses   # also every wrong answer
 * Env: LAYA_API_BASE_URL (default http://localhost:8090), LAYA_API_KEY.
 * Both case sets, each message sorted two ways: Laya alone, and as shipped
 * (lexical cues first, Laya for the rest, its checkout/removal answers refused
 * without the words for them). `INTENT_HOLDOUT` was written before the cues
 * and never used to shape them. Russian cases are sent as `englishOf(...)`
 * (`intent-cases-en.ts`), as production sends the translation.
 */

import { createDecisionAgent } from "../src/decision-agent.ts";
import type { DecisionAgent } from "../src/decision-types.ts";
import { INTENT_CASES, INTENT_HOLDOUT } from "../src/goap/intent-cases.ts";
import { englishOf } from "../src/goap/intent-cases-en.ts";
import { classifyMessageIntent } from "../src/goap/message-intent.ts";

const laya = createDecisionAgent({
	baseURL: process.env.LAYA_API_BASE_URL ?? "http://localhost:8090",
	apiKey: process.env.LAYA_API_KEY ?? "",
	telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
});

// Laya reads English only (like production, where the orchestrator translates
// first): the Russian cases go along with their English rendering, and the run
// stops if anything that is not Latin still reaches the model.
const agent: DecisionAgent = {
	decide(state, questions) {
		if (
			/(?!\p{Script=Latin})\p{L}/u.test(JSON.stringify({ state, questions }))
		) {
			throw new Error("non-English text reached Laya");
		}
		return laya.decide(state, questions);
	},
};

const showMisses = process.argv.includes("--misses");
const lang = (message: string) => (/[а-яё]/i.test(message) ? "ru" : "en");

for (const [setName, cases] of [
	["INTENT_CASES", INTENT_CASES],
	["INTENT_HOLDOUT", INTENT_HOLDOUT],
] as const) {
	for (const [mode, cues] of [
		["Laya alone", false],
		["as shipped", true],
	] as const) {
		let ok = 0;
		const byLang: Record<string, [number, number]> = { ru: [0, 0], en: [0, 0] };
		const misses: string[] = [];
		for (const testCase of cases) {
			const got = await classifyMessageIntent(
				{ decisionAgent: agent, cues },
				testCase.message,
				englishOf(testCase.message),
			);
			const hit = got === testCase.expected;
			ok += hit ? 1 : 0;
			const stat = byLang[lang(testCase.message)] as [number, number];
			stat[0] += hit ? 1 : 0;
			stat[1] += 1;
			if (!hit) {
				misses.push(
					`    ${testCase.message}  → ${got} (want ${testCase.expected})`,
				);
			}
		}
		console.log(
			`${setName.padEnd(15)} ${mode.padEnd(11)} ${ok}/${cases.length} ${((100 * ok) / cases.length).toFixed(0)}%   ru ${byLang.ru?.[0]}/${byLang.ru?.[1]}  en ${byLang.en?.[0]}/${byLang.en?.[1]}`,
		);
		if (showMisses) for (const line of misses) console.log(line);
	}
}
