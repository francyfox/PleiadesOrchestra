import type { FetchContext } from "../common/common.types.ts";
import type {
	McpParam,
	McpSites,
	McpTool,
	UpstreamMcpSites,
} from "./mcp.schema.ts";

type Upstream = UpstreamMcpSites["items"][number]["tools"][number];

const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const text = (value: unknown): string | null =>
	typeof value === "string" && value !== "" ? value : null;

const strings = (value: unknown): string[] | null => {
	if (!Array.isArray(value)) return null;
	const list = value.filter((item): item is string => typeof item === "string");
	return list.length > 0 ? list : null;
};

/** One argument of a tool out of its JSON-schema property: `string`, `string[]`, enum values, … */
function describeParam(
	name: string,
	schema: unknown,
	required: boolean,
): McpParam {
	const node = record(schema);
	const items = record(node.items);
	const itemType = text(items.type);
	const type = text(node.type);
	return {
		name,
		type: type === "array" && itemType ? `${itemType}[]` : type,
		description: text(node.description),
		required,
		values: strings(node.enum) ?? strings(items.enum),
	};
}

/** A tool as the page announced it, with its parameters spelled out for reading. */
export function describeTool(tool: Upstream): McpTool {
	const schema = record(tool.inputSchema);
	const required = new Set(strings(schema.required) ?? []);
	return {
		name: tool.name,
		description: text(tool.description),
		params: Object.entries(record(schema.properties)).map(([name, property]) =>
			describeParam(name, property, required.has(name)),
		),
	};
}

/** `GET /api/mcp`: the tool catalogs the channels' pages announced, parameters spelled out. */
export async function fetchMcpSites({
	orchestrator,
}: Pick<FetchContext, "orchestrator">): Promise<McpSites> {
	const { items } = await orchestrator.listMcp();
	return {
		items: items.map((site) => ({
			...site,
			tools: site.tools.map(describeTool),
		})),
	};
}
