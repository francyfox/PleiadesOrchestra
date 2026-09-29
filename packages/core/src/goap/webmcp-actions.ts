import type { DecisionAgent } from "../decision-types";
import {
	EFFECTS_BY_INTENT,
	PRECONDITIONS_BY_INTENT,
	TOOL_INTENTS,
	type ToolIntent,
} from "./intent-taxonomy";
import { buildArguments } from "./tool-source";
import type { ActionContext, ActionResult, GoapAction } from "./types";

export interface WebMcpToolDescriptor {
	name: string;
	description?: string;
	inputSchema?: { type: "object"; properties?: Record<string, unknown> };
}

/** The shape of `WaitingOn.payload` when `WaitingOn.kind === "webmcp_tool_call"`. */
export interface WebMcpToolCallPayload {
	tool: string;
	arguments: Record<string, unknown>;
}

export interface CreateWebMcpActionsConfig {
	tools: WebMcpToolDescriptor[];
	decisionAgent: DecisionAgent;
	/** Real resource cost per tool — a browser round trip's latency varies with the tool, so this is a hook, not a constant, mirroring `McpToolSourceConfig.costFor`. */
	costFor?: (tool: WebMcpToolDescriptor) => number;
}

/** Placeholder until real calibration data exists — matches `tool-source.ts`'s `DEFAULT_MCP_TOOL_COST`. */
const DEFAULT_WEBMCP_TOOL_COST = 3;

async function classifyToolIntent(
	decisionAgent: DecisionAgent,
	tool: WebMcpToolDescriptor,
): Promise<ToolIntent> {
	const answers = await decisionAgent.decide(
		{ name: tool.name, description: tool.description ?? "" },
		{
			intent: {
				type: "choice",
				instructions:
					"Which e-commerce action does this tool most likely perform?",
				criteria: [...TOOL_INTENTS],
			},
		},
	);
	const answer = answers.intent;
	const choice = answer?.type === "choice" ? answer.choice : undefined;
	return choice && (TOOL_INTENTS as readonly string[]).includes(choice)
		? (choice as ToolIntent)
		: "other";
}

/**
 * Turns a widget-supplied WebMCP tool list into `GoapAction`s — the WebMCP
 * counterpart of `createMcpToolSource` (`tool-source.ts`), classifying each
 * tool once per catalog build the same way (one Laya `choice` call per
 * tool, `TOOL_INTENTS`/`EFFECTS_BY_INTENT`/`PRECONDITIONS_BY_INTENT`,
 * `intent-taxonomy.ts`). The one real difference: a WebMCP tool call can
 * only execute in the visitor's browser (see
 * docs/laya-autonomous-webmcp.md, "WebMCP vs MCP"), so `execute()` never
 * calls anything itself — it either reads a result the browser already
 * reported (`webmcp:<name>:result`, written by the orchestrator on resume —
 * see `server.ts`'s `resumeReply`) or asks the run to pause
 * (`{ waiting: { kind: "webmcp_tool_call", ... } }`, see `WaitingOn` in
 * `types.ts`).
 */
export async function createWebMcpActions(
	config: CreateWebMcpActionsConfig,
): Promise<GoapAction[]> {
	const costFor = config.costFor ?? (() => DEFAULT_WEBMCP_TOOL_COST);

	return Promise.all(
		config.tools.map(async (tool): Promise<GoapAction> => {
			const intent = await classifyToolIntent(config.decisionAgent, tool);
			const toolResultKey = `toolResult:${tool.name}`;
			const resultKey = `webmcp:${tool.name}:result`;

			return {
				name: tool.name,
				cost: costFor(tool),
				preconditions: PRECONDITIONS_BY_INTENT[intent],
				effects: { ...EFFECTS_BY_INTENT[intent], [toolResultKey]: true },
				async execute(ctx: ActionContext): Promise<ActionResult> {
					const resultFact = ctx.state[resultKey];
					if (resultFact === "ok") {
						return { ...EFFECTS_BY_INTENT[intent], [toolResultKey]: true };
					}
					if (resultFact === "error") {
						return { [toolResultKey]: false };
					}
					const payload: WebMcpToolCallPayload = {
						tool: tool.name,
						arguments: buildArguments(
							ctx.state,
							tool.inputSchema ?? { type: "object" },
						),
					};
					return { waiting: { kind: "webmcp_tool_call", payload } };
				},
			};
		}),
	);
}
