/**
 * Live accuracy of `decomposeMessage` against delta (function-call model):
 *   bun run eval:decompose              # summary + every failing case
 * Env: FUNCTION_CALL_BASE_URL (default http://localhost:8282/v1), FUNCTION_CALL_API_KEY,
 * FUNCTION_CALL_MODEL (default qwen3-1.7b), FUNCTION_CALL_REASONING_EFFORT (Ollama: none).
 * Score per case: task count, intent set (order-free), `after` per position.
 * No answer (undefined) counts as a miss on all three.
 */

import { createFunctionCallAgent } from "../src/function-call-agent.ts";
import { DECOMPOSITION_CASES } from "../src/goap/decomposition-cases.ts";
import { decompositionDescriptions } from "../src/goap/intent-taxonomy.ts";
import { decomposeMessage } from "../src/goap/task-decomposition.ts";

const effort = process.env.FUNCTION_CALL_REASONING_EFFORT;
const agent = createFunctionCallAgent({
	baseURL: process.env.FUNCTION_CALL_BASE_URL ?? "http://localhost:8282/v1",
	apiKey: process.env.FUNCTION_CALL_API_KEY ?? "",
	model: process.env.FUNCTION_CALL_MODEL ?? "qwen3-1.7b",
	providerOptions: effort ? { reasoningEffort: effort } : undefined,
	telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
});
const intents = decompositionDescriptions();
const fmt = (tasks: { intent: string; after?: number }[] | undefined) =>
	tasks
		? tasks
				.map((x) => x.intent + (x.after === undefined ? "" : `<-${x.after}`))
				.join(", ")
		: "(none)";

let count = 0;
let set = 0;
let after = 0;
let exact = 0;
let none = 0;
const latencies: number[] = [];
for (const testCase of DECOMPOSITION_CASES) {
	const started = Date.now();
	const got = await decomposeMessage(agent, intents, testCase.message);
	latencies.push(Date.now() - started);
	const want = testCase.expected;
	const okCount = got?.length === want.length;
	const okSet =
		!!got &&
		JSON.stringify(got.map((x) => x.intent).sort()) ===
			JSON.stringify(want.map((x) => x.intent).sort());
	const okAfter =
		okCount && want.every((x, i) => (got?.[i]?.after ?? undefined) === x.after);
	count += okCount ? 1 : 0;
	set += okSet ? 1 : 0;
	after += okAfter ? 1 : 0;
	none += got ? 0 : 1;
	if (
		okCount &&
		okSet &&
		okAfter &&
		want.every((x, i) => got?.[i]?.intent === x.intent)
	) {
		exact += 1;
	} else {
		console.log(
			`  ${testCase.message}\n    got  ${fmt(got)}  [${latencies.at(-1)} ms]\n    want ${fmt(want)}`,
		);
	}
}
const n = DECOMPOSITION_CASES.length;
const sorted = [...latencies].sort((a, b) => a - b);
console.log(
	`count ${count}/${n}  intent-set ${set}/${n}  after ${after}/${n}  exact-in-order ${exact}/${n}  no-answer ${none}`,
);
console.log(
	`latency ms: median ${sorted[Math.floor(n / 2)]}  p90 ${sorted[Math.floor(n * 0.9)]}  max ${sorted.at(-1)}`,
);
