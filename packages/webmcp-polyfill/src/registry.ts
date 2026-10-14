import type { AnyWindow, NormalizedTool, RawTool } from "./types.ts";

const NAME_FORMAT = /^[a-zA-Z0-9_.-]{1,128}$/;

function invalid(message: string): DOMException {
	return new DOMException(message, "InvalidStateError");
}

/**
 * Throws the spec-shaped error for a malformed tool definition. Any script on
 * the page can call `document.modelContext.registerTool`, so the input is
 * untrusted until this passes.
 */
export function assertValidTool(tool: unknown): asserts tool is RawTool {
	if (!tool || typeof tool !== "object")
		throw new DOMException("Invalid tool object", "TypeError");
	const { name, description } = tool as Record<string, unknown>;
	if (typeof name !== "string" || !name) throw invalid("Invalid tool name");
	if (typeof description !== "string" || !description)
		throw invalid("Invalid tool description");
	if (!NAME_FORMAT.test(name)) throw invalid("Invalid tool name format");
}

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/** Imperative tool store living on `win.__webmcp_registered_tools`. */
export function createToolRegistry(win: AnyWindow, onChange: () => void) {
	const store = () => {
		win.__webmcp_registered_tools ??= new Map();
		return win.__webmcp_registered_tools;
	};

	const unregister = (name: string) => {
		if (store().delete(name)) onChange();
	};

	const register = async (
		tool: unknown,
		options: { signal?: AbortSignal } = {},
	): Promise<void> => {
		assertValidTool(tool);
		const { name, description } = tool;
		if (store().has(name))
			throw invalid(`Tool "${name}" is already registered`);
		if (tool.inputSchema) JSON.stringify(tool.inputSchema); // throws if not serializable

		const { signal } = options;
		if (signal) {
			if (signal.aborted) throw abortReason(signal);
			signal.addEventListener("abort", () => unregister(name as string));
		}

		store().set(
			name as string,
			{
				name,
				description,
				inputSchema: tool.inputSchema,
				annotations: tool.annotations,
				window: win,
				origin: win.origin,
				_execute: tool.execute,
			} as NormalizedTool,
		);
		onChange();
	};

	return { register, unregister };
}
