import { retryAsJsonString } from "./execute-tool.ts";
import { toWireError } from "./tool-error.ts";
import type {
	ExecuteOptions,
	NormalizedTool,
	SerializableTool,
} from "./types.ts";

/** Normalizes entries to bare origins; drops wildcards and anything unparsable. */
export function normalizeOrigins(
	list: readonly string[] | undefined,
): string[] {
	const out: string[] = [];
	for (const raw of list ?? []) {
		try {
			const u = new URL(raw.trim());
			if (u.origin !== "null") out.push(u.origin);
		} catch {
			/* "*" and garbage never open the bridge */
		}
	}
	return out;
}

export type ProviderRequest =
	| { kind: "get-tools"; requestId: string; source: Window }
	| {
			kind: "execute";
			requestId: string;
			source: Window;
			name: string;
			input: unknown;
	  };

/**
 * Decides whether an incoming message is served: only allow-listed origins
 * with a source window, and only the two known request types.
 */
export function classifyRequest(
	exposed: ReadonlySet<string>,
	event: Pick<MessageEvent, "data" | "source" | "origin">,
): ProviderRequest | null {
	const { data, source, origin } = event;
	if (!exposed.has(origin) || !source) return null;
	const base = { requestId: data?.requestId, source: source as Window };
	if (data?.type === "WEBMCP_GET_TOOLS_REQUEST")
		return { kind: "get-tools", ...base };
	if (data?.type === "WEBMCP_EXECUTE_TOOL_REQUEST")
		return {
			kind: "execute",
			...base,
			name: data.name,
			input: data.inputObject !== undefined ? data.inputObject : data.args,
		};
	return null;
}

function toSerializable(t: NormalizedTool): SerializableTool {
	const { name, description, inputSchema, origin, annotations } = t;
	return { name, description, inputSchema, origin, annotations };
}

export interface ProviderDeps {
	exposed: ReadonlySet<string>;
	listLocalTools: () => NormalizedTool[];
	executeTool: (
		tool: NormalizedTool,
		input: unknown,
		options?: ExecuteOptions,
	) => Promise<unknown>;
}

/** Answering side of the cross-window bridge; replies go to `event.origin`. */
export function createProvider(deps: ProviderDeps) {
	const execute = async (
		req: Extract<ProviderRequest, { kind: "execute" }>,
		reply: (m: unknown) => void,
	) => {
		const response = {
			type: "WEBMCP_EXECUTE_TOOL_RESPONSE",
			requestId: req.requestId,
		};
		try {
			const tool = deps.listLocalTools().find((t) => t.name === req.name);
			if (!tool) throw new Error(`Tool ${req.name} not found`);
			const result = await retryAsJsonString(
				(i) => deps.executeTool(tool, i),
				req.input,
			);
			reply({ ...response, success: true, result });
		} catch (err) {
			reply({ ...response, success: false, ...toWireError(err) });
		}
	};

	return async (event: MessageEvent): Promise<void> => {
		const req = classifyRequest(deps.exposed, event);
		if (!req) return;
		const reply = (message: unknown) =>
			req.source.postMessage(message, event.origin);
		if (req.kind === "get-tools")
			reply({
				type: "WEBMCP_GET_TOOLS_RESPONSE",
				requestId: req.requestId,
				tools: deps.listLocalTools().map(toSerializable),
			});
		else await execute(req, reply);
	};
}
