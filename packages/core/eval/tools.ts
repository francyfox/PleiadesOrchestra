/**
 * Live accuracy of tool classification (`classifyToolIntent`) on the demo
 * shop's tools, Laya alone vs as shipped (the tool's name first):
 *   bun run eval:tools
 * Env: LAYA_API_BASE_URL (default http://localhost:8090), LAYA_API_KEY.
 */
import { createDecisionAgent } from "../src/decision-agent.ts";
import { classifyToolIntent } from "../src/goap/webmcp-actions.ts";
import { DEMO_TOOLS } from "./demo-tools.ts";

const agent = createDecisionAgent({
	baseURL: process.env.LAYA_API_BASE_URL ?? "http://localhost:8090",
	apiKey: process.env.LAYA_API_KEY ?? "",
	telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
});

// "Laya alone": names scrambled so the name cues find nothing to read.
const nameless = (name: string) => `tool_${name.length}_${name.charCodeAt(0)}`;

for (const [mode, rename] of [
	["Laya alone", nameless],
	["as shipped", (name: string) => name],
] as const) {
	let ok = 0;
	const lines: string[] = [];
	for (const tool of DEMO_TOOLS) {
		const got = await classifyToolIntent(agent, {
			name: rename(tool.name),
			description: tool.description,
		});
		ok += got === tool.expected ? 1 : 0;
		if (got !== tool.expected) {
			lines.push(`    ${tool.name} → ${got} (want ${tool.expected})`);
		}
	}
	console.log(`${mode.padEnd(11)} ${ok}/${DEMO_TOOLS.length}`);
	for (const line of lines) console.log(line);
}
