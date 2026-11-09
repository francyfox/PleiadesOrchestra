/**
 * Live check of messages that follow the assistant's own reply (a picked
 * button or a typed answer): alpha-understand reads the message with the
 * conversation (`conversationContext`, as `initialState` does) and writes `en`,
 * then `chooseTool` + `askedOptions` pick the tool from that text, as on a
 * channel without an intent set. Three ways:
 *   no context     the message alone (how a typed answer was read before);
 *   last exchange  the reply and the visitor message before it (production);
 *   whole chain    every message of the case.
 * Scored per kind (answer, topic change, long chain; answers-cases.ts).
 *   bun run eval:answers
 * Env: UNDERSTAND_BASE_URL/UNDERSTAND_API_KEY/UNDERSTAND_MODEL
 * (alpha-understand) and DECISION_*; or `albedo eval --name answers` takes the
 * running orchestrator's.
 */
import { intentFromMessageCues, SHOP_TAXONOMY } from "@repo/intent-presets";
import { createDecisionAgent } from "#core/decision-agent";
import { createFunctionCallAgent } from "#core/function-call-agent";
import { decompositionDescriptions } from "#core/goap/index";
import { effectsOf } from "#core/goap/intent-taxonomy";
import {
	askedOptions,
	chooseTool,
	type ToolOption,
} from "#core/goap/tool-choice";
import {
	answersAssistant,
	conversationContext,
	understandMessage,
} from "#core/goap/understanding";
import { classifyToolIntent } from "#core/goap/webmcp-actions";
import { ANSWER_CASES, type AnswerCase } from "./answers-cases.ts";
import { TOOL_CHOICE_SITES } from "./choose-tool-cases.ts";

const decision = createDecisionAgent({
	baseURL: process.env.DECISION_BASE_URL ?? "http://localhost:8090",
	apiKey: process.env.DECISION_API_KEY ?? "",
	...(process.env.DECISION_MODEL
		? { modelId: process.env.DECISION_MODEL }
		: {}),
	telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
});
const effort = process.env.UNDERSTAND_REASONING_EFFORT;
const understand = createFunctionCallAgent({
	baseURL: process.env.UNDERSTAND_BASE_URL ?? "http://localhost:8080/v1",
	apiKey: process.env.UNDERSTAND_API_KEY ?? "",
	model: process.env.UNDERSTAND_MODEL ?? "",
	temperature: 0,
	maxOutputTokens: 768,
	...(effort ? { providerOptions: { reasoningEffort: effort } } : {}),
	telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
});

const started = Date.now();
const seconds = () => `${Math.round((Date.now() - started) / 1000)}s`;
console.log(
	`classifying the tools of ${TOOL_CHOICE_SITES.length} demo sites (one decision call per tool)…`,
);
const toolsOf = new Map<string, ToolOption[]>();
for (const site of TOOL_CHOICE_SITES) {
	toolsOf.set(
		site.site,
		await Promise.all(
			site.tools.map(async (tool) => {
				const intent = await classifyToolIntent(decision, {
					...tool,
					inputSchema: { type: "object", properties: {} },
				});
				return {
					...tool,
					effects: { ...effectsOf(intent), [`toolResult:${tool.name}`]: true },
				};
			}),
		),
	);
}

const intents = decompositionDescriptions(SHOP_TAXONOMY);
const MODES = ["no context", "last exchange", "whole chain"] as const;
const KINDS: AnswerCase["kind"][] = ["answer", "topic", "chain", "noise"];
const score = new Map<string, number>();
const total = new Map<string, number>();
const misses: string[] = [];
const add = (map: Map<string, number>, key: string) =>
	map.set(key, (map.get(key) ?? 0) + 1);

console.log(
	`${ANSWER_CASES.length} cases x ${MODES.length} ways, in order; one line per case (✓ right, ✗ wrong: no context / last exchange / whole chain)`,
);
let done = 0;
for (const { kind, site, history, message, expected } of ANSWER_CASES) {
	const tools = toolsOf.get(site) ?? [];
	const marks: string[] = [];
	for (const mode of MODES) {
		// Same cut as production: the newest messages, the last one answered.
		const quoted =
			mode === "no context"
				? {}
				: conversationContext(
						mode === "last exchange" ? history.slice(-2) : history,
					);
		// As production: a message that does not answer the quote is read alone.
		const context =
			quoted.replyTo &&
			(await answersAssistant(decision, quoted.replyTo, message)) === false
				? {}
				: quoted;
		const understood = await understandMessage(
			understand,
			intents,
			message,
			"en",
			undefined,
			context,
		);
		const en = understood?.en ?? message;
		const choice = await chooseTool(
			{
				decisionAgent: decision,
				tools,
				intent: intentFromMessageCues(SHOP_TAXONOMY, en),
			},
			en,
		);
		const chosen =
			choice.kind === "tool"
				? tools.find((tool) => tool.name === choice.tool)
				: undefined;
		const asked =
			chosen && (await askedOptions({ decisionAgent: decision }, chosen, en));
		const got =
			choice.kind !== "tool"
				? choice.kind
				: asked
					? `options:${choice.tool}`
					: choice.tool;
		add(total, `${mode}/${kind}`);
		marks.push(got === expected ? "✓" : "✗");
		if (got === expected) add(score, `${mode}/${kind}`);
		else
			misses.push(
				`  [${mode}, ${kind}] ${site}: «${message}» → en «${en}» → ${got} (want ${expected})`,
			);
	}
	console.log(
		`[${++done}/${ANSWER_CASES.length}] ${marks.join(" ")}  ${kind} · ${site} · «${message}»  ${seconds()}`,
	);
}

console.log(`\n${"".padEnd(14)} ${KINDS.map((k) => k.padEnd(8)).join(" ")}`);
for (const mode of MODES) {
	const cells = KINDS.map((kind) => {
		const key = `${mode}/${kind}`;
		return `${score.get(key) ?? 0}/${total.get(key) ?? 0}`.padEnd(8);
	});
	console.log(`${mode.padEnd(14)} ${cells.join(" ")}`);
}
for (const line of misses) console.log(line);
