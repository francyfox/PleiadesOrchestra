import type { ActionContext, GoapAction, WorldState } from "./types";

/**
 * Narrow port for the one thing this module needs from an MCP client — not
 * `@modelcontextprotocol/client`'s own `Client` type, so this file (and its
 * tests) stay decoupled from the real SDK/transport, the same way
 * `DecisionAgent`/`Agent` are narrow ports rather than raw SDK types
 * elsewhere in this package. The real SDK's `Client` structurally satisfies
 * this already — see `connectStdioMcpClient` below.
 */
export interface McpClient {
	listTools(): Promise<{ tools: McpToolDescriptor[] }>;
	callTool(params: {
		name: string;
		arguments?: Record<string, unknown>;
	}): Promise<McpCallToolResult>;
}

export interface McpToolDescriptor {
	name: string;
	description?: string;
	inputSchema: { type: "object"; properties?: Record<string, unknown> };
}

export interface McpCallToolResult {
	content: Array<{ type: string; text?: string }>;
	isError?: boolean;
}

/** What `packages/core/src/goap/plan.ts`'s planner and `ToolSource`-consuming callers both use. */
export interface ToolSource {
	listActions(): Promise<GoapAction[]>;
}

export interface McpToolSourceConfig {
	client: McpClient;
	/** Real resource cost per tool, per the plan doc's cost model — MCP tools sit "somewhere between" Laya and albedo, and vary per tool, so this is a hook, not a constant. Defaults to `DEFAULT_MCP_TOOL_COST` until real calibration data exists (see the plan doc's open questions). */
	costFor?: (tool: McpToolDescriptor) => number;
}

/** Placeholder until the plan doc's benchmark (open question) gives a real number. */
const DEFAULT_MCP_TOOL_COST = 3;

/**
 * Maps `state` facts onto tool call arguments by matching the input
 * schema's own property names — covers parameters whose value is already
 * known (extracted earlier by some other action), the same way for any
 * tool source keyed on a JSON-Schema-shaped `inputSchema` (MCP here,
 * WebMCP in `webmcp-actions.ts`). See docs/laya-autonomous-webmcp.md,
 * "Аргументы тула: bounded vs open".
 */
export function buildArguments(
	state: WorldState,
	inputSchema: McpToolDescriptor["inputSchema"],
): Record<string, unknown> {
	const properties = (inputSchema.properties ?? {}) as Record<string, unknown>;
	const args: Record<string, unknown> = {};
	for (const [name, schema] of Object.entries(properties)) {
		if (state[name] !== undefined) {
			args[name] = state[name];
			continue;
		}
		const list = listOfOneObject(state, schema);
		if (list) args[name] = list;
	}
	return args;
}

/**
 * For a parameter like `items: [{ product, quantity }]` (typical of
 * add-to-cart tools): a one-element list whose object is filled from the
 * facts named like its properties — `product` and `quantity` in the state
 * become `[{ product, quantity }]`. `undefined` when the schema isn't such a
 * list or a required property of the object has no fact yet.
 */
function listOfOneObject(
	state: WorldState,
	schema: unknown,
): Record<string, unknown>[] | undefined {
	const list = schema as {
		type?: string;
		items?: {
			type?: string;
			properties?: Record<string, unknown>;
			required?: string[];
		};
	};
	if (list.type !== "array" || list.items?.type !== "object") return undefined;

	const item: Record<string, unknown> = {};
	for (const name of Object.keys(list.items.properties ?? {})) {
		if (state[name] !== undefined) item[name] = state[name];
	}
	const complete = (list.items.required ?? []).every((name) => name in item);
	return complete && Object.keys(item).length > 0 ? [item] : undefined;
}

function toGoapAction(
	tool: McpToolDescriptor,
	client: McpClient,
	costFor: (tool: McpToolDescriptor) => number,
): GoapAction {
	const resultKey = `toolResult:${tool.name}`;

	return {
		name: tool.name,
		cost: costFor(tool),
		preconditions: {},
		effects: { [resultKey]: true },
		async execute(ctx: ActionContext) {
			const result = await client.callTool({
				name: tool.name,
				arguments: buildArguments(ctx.state, tool.inputSchema),
			});

			if (result.isError) return { [resultKey]: false };

			const text = result.content
				.map((block) => block.text)
				.filter((value): value is string => value !== undefined)
				.join("");

			return { [resultKey]: true, [`${resultKey}:text`]: text };
		},
	};
}

/**
 * First `ToolSource` implementation (Phase 4 of the plan doc): mechanically
 * turns whatever a real MCP server's `tools/list` advertises into
 * `GoapAction`s — no per-tool config, that's the "auto" part. Call
 * arguments come from world-state facts whose keys match the tool's
 * declared input-schema property names; a tool the server doesn't give more
 * precise effect semantics for just gets `{ toolResult:<name>: true/false }`
 * on success/failure, plus the joined text content for anything beyond the
 * bare minimum.
 */
export function createMcpToolSource(config: McpToolSourceConfig): ToolSource {
	const costFor = config.costFor ?? (() => DEFAULT_MCP_TOOL_COST);

	return {
		async listActions() {
			const { tools } = await config.client.listTools();
			return tools.map((tool) => toGoapAction(tool, config.client, costFor));
		},
	};
}
