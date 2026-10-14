import { runFormTool } from "./declarative-forms.ts";
import type { createRemoteBridge } from "./remote-bridge.ts";
import type {
	AnyWindow,
	ExecuteOptions,
	McpDocument,
	NormalizedTool,
} from "./types.ts";

/** Runs `exec`; on a "Failed to parse input" error retries with a JSON string. */
export async function retryAsJsonString(
	exec: (input: unknown) => Promise<unknown>,
	input: unknown,
): Promise<unknown> {
	try {
		return await exec(input);
	} catch (e) {
		if ((e as Error).message?.startsWith("Failed to parse input"))
			return await exec(JSON.stringify(input));
		throw e;
	}
}

/** Strings are tried as JSON; anything unparsable is kept as-is. */
export function parseArgs(input: unknown): unknown {
	if (typeof input !== "string") return input;
	try {
		return JSON.parse(input);
	} catch {
		return input;
	}
}

/** Another same-origin window's own model context, when it can execute. */
function foreignExecutor(w: AnyWindow, win: AnyWindow) {
	const mc = (w.document as McpDocument | undefined)?.modelContext;
	return w !== win && mc?.executeTool ? mc : null;
}

/** `executeTool`: routes a tool to remote window, foreign context, registry or form. */
export function createToolExecutor(
	win: AnyWindow,
	remote: Pick<ReturnType<typeof createRemoteBridge>, "execute">,
) {
	return async (
		tool: NormalizedTool,
		inputObject: unknown,
		options: ExecuteOptions = {},
	): Promise<unknown> => {
		if (inputObject === undefined)
			throw new TypeError("inputObject is undefined");
		JSON.stringify(inputObject); // throws if not serializable

		const w = tool.window ?? win;
		if (tool._isRemote) return remote.execute(tool, w, inputObject);

		const foreign = foreignExecutor(w, win);
		if (foreign)
			return retryAsJsonString(
				(i) => foreign.executeTool(tool, i),
				inputObject,
			);

		const args = parseArgs(inputObject);
		const registered = w.__webmcp_registered_tools?.get(tool.name);
		if (registered)
			return (registered._execute as NonNullable<typeof registered._execute>)(
				args,
				options,
			);
		return runFormTool(w, tool, args, options);
	};
}
