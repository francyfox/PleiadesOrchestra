/**
 * Live accuracy of `chooseTool` (channels without an intent set) on several
 * demo sites, three ways:
 *   names only    every round reads tool names (how it was before);
 *   descriptions  the last round reads names + descriptions;
 *   as shipped    + the intent the words give narrows the tools.
 * Each tool's effects come from `classifyToolIntent`, as on registration.
 *   bun run eval:choose-tool
 * Env: DECISION_BASE_URL (default http://localhost:8090; a URL ending in
 * `/decisions` is OpenRouter), DECISION_API_KEY, DECISION_MODEL; or
 * `albedo eval --name choose-tool` takes the running orchestrator's.
 */
import { intentFromMessageCues, SHOP_TAXONOMY } from "@repo/intent-presets";
import { createDecisionAgent } from "#core/decision-agent";
import { effectsOf } from "#core/goap/intent-taxonomy";
import { chooseTool, type ToolOption } from "#core/goap/tool-choice";
import { classifyToolIntent } from "#core/goap/webmcp-actions";
import { TOOL_CHOICE_SITES } from "./choose-tool-cases.ts";

const agent = createDecisionAgent({
	baseURL: process.env.DECISION_BASE_URL ?? "http://localhost:8090",
	apiKey: process.env.DECISION_API_KEY ?? "",
	...(process.env.DECISION_MODEL
		? { modelId: process.env.DECISION_MODEL }
		: {}),
	telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
});

type Mode = "names only" | "descriptions" | "as shipped";
const MODES: Mode[] = ["names only", "descriptions", "as shipped"];
const score = Object.fromEntries(MODES.map((m) => [m, { ok: 0, total: 0 }]));
const misses: string[] = [];

for (const site of TOOL_CHOICE_SITES) {
	const tools: ToolOption[] = await Promise.all(
		site.tools.map(async (tool) => {
			const intent = await classifyToolIntent(agent, {
				...tool,
				inputSchema: { type: "object", properties: {} },
			});
			return {
				...tool,
				effects: { ...effectsOf(intent), [`toolResult:${tool.name}`]: true },
			};
		}),
	);
	// The label of a multi-word name never reads the description, so dropping it is "names only".
	const namesOnly = tools.map((tool) =>
		/[_A-Z]/.test(tool.name.slice(1)) ? { name: tool.name } : tool,
	);
	for (const { message, expected } of site.cases) {
		for (const mode of MODES) {
			const choice = await chooseTool(
				{
					decisionAgent: agent,
					tools: mode === "names only" ? namesOnly : tools,
					...(mode === "as shipped"
						? { intent: intentFromMessageCues(SHOP_TAXONOMY, message) }
						: {}),
				},
				message,
			);
			const got = choice.kind === "tool" ? choice.tool : choice.kind;
			const s = score[mode] as { ok: number; total: number };
			s.total++;
			if (got === expected) s.ok++;
			else
				misses.push(
					`  [${mode}] ${site.site}: «${message}» → ${got} (want ${expected})`,
				);
		}
	}
}

for (const mode of MODES) {
	const { ok, total } = score[mode] as { ok: number; total: number };
	console.log(`${mode.padEnd(13)} ${ok}/${total}`);
}
for (const line of misses) console.log(line);
