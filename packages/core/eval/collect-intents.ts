/**
 * Raw Laya probabilities for the message-intent question, asked exactly as
 * production asks it (`MESSAGE_INTENT_INSTRUCTIONS` / `MESSAGE_INTENT_CRITERIA`,
 * the English text only), for every eval case Laya may answer. Saved once so
 * `bun run calibrate` can fit offline and repeatably:
 *   bun eval/collect-intents.ts            # -> eval/data/laya-intents.json
 * Env: DECISION_BASE_URL, DECISION_API_KEY, DECISION_MODEL (as `eval:intents`).
 */

import { createDecisionAgent } from "#core/decision-agent";
import { INTENT_CASES, INTENT_HOLDOUT } from "#core/goap/intent-cases";
import { englishOf } from "#core/goap/intent-cases-en";
import {
	MESSAGE_INTENT_CRITERIA,
	MESSAGE_INTENT_INSTRUCTIONS,
} from "#core/goap/message-intent";
import type { LayaRecord } from "#core/laya-fit";

const laya = createDecisionAgent({
	baseURL: process.env.DECISION_BASE_URL ?? "http://localhost:8090",
	apiKey: process.env.DECISION_API_KEY ?? "",
	...(process.env.DECISION_MODEL
		? { modelId: process.env.DECISION_MODEL }
		: {}),
	telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
});

const records: LayaRecord[] = [];
for (const [set, cases] of [
	["INTENT_CASES", INTENT_CASES],
	["INTENT_HOLDOUT", INTENT_HOLDOUT],
] as const) {
	for (const testCase of cases) {
		// checkout / removeFromCart are not options: Laya is never asked for them.
		if (!(testCase.expected in MESSAGE_INTENT_CRITERIA)) continue;
		const text = englishOf(testCase.message) ?? testCase.message;
		if (/(?!\p{Script=Latin})\p{L}/u.test(text)) continue;
		const answers = await laya.decide(
			{ message: text },
			{
				intent: {
					type: "choice",
					instructions: MESSAGE_INTENT_INSTRUCTIONS,
					criteria: MESSAGE_INTENT_CRITERIA,
				},
			},
		);
		const answer = answers.intent;
		if (answer?.type !== "choice" || !answer.probabilities) continue;
		records.push({
			kind: "choice",
			source: set,
			text,
			options: Object.keys(MESSAGE_INTENT_CRITERIA),
			probabilities: answer.probabilities,
			label: testCase.expected,
		});
	}
}

const out = new URL("./data/laya-intents.json", import.meta.url);
await Bun.write(
	out,
	`${JSON.stringify({ at: new Date().toISOString(), records }, null, "\t")}\n`,
);
console.log(`${records.length} intent records -> ${out.pathname}`);
