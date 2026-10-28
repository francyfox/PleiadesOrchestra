/**
 * Live accuracy of tool classification (`classifyToolIntent`) on the demo
 * shop's tools, model alone vs as shipped (the tool's name first):
 *   bun run eval:tools
 * Env: DECISION_BASE_URL (default http://localhost:8090; a URL ending in
 * `/decisions` is OpenRouter), DECISION_API_KEY, DECISION_MODEL; or
 * `albedo eval --name tools` takes the running orchestrator's.
 */
import { createDecisionAgent } from "#core/decision-agent";
import { classifyToolIntent } from "#core/goap/webmcp-actions";
import { DEMO_TOOLS } from "./demo-tools.ts";

const agent = createDecisionAgent({
	baseURL: process.env.DECISION_BASE_URL ?? "http://localhost:8090",
	apiKey: process.env.DECISION_API_KEY ?? "",
	...(process.env.DECISION_MODEL
		? { modelId: process.env.DECISION_MODEL }
		: {}),
	telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
});

// "model alone": names scrambled so the name cues find nothing to read.
const nameless = (name: string) => `tool_${name.length}_${name.charCodeAt(0)}`;

for (const [mode, rename] of [
	["model alone", nameless],
	["as shipped", (name: string) => name],
] as const) {
	let ok = 0;
	let total = 0;
	const lines: string[] = [];
	for (const tool of DEMO_TOOLS) {
		// `readState` is a tool's role read from its name; the model is never offered it.
		if (mode === "model alone" && tool.expected === "readState") continue;
		const got = await classifyToolIntent(agent, {
			name: rename(tool.name),
			description: tool.description,
			inputSchema: tool.inputSchema,
		});
		ok += got === tool.expected ? 1 : 0;
		total++;
		if (got !== tool.expected) {
			lines.push(`    ${tool.name} → ${got} (want ${tool.expected})`);
		}
	}
	console.log(`${mode.padEnd(11)} ${ok}/${total}`);
	for (const line of lines) console.log(line);
}
