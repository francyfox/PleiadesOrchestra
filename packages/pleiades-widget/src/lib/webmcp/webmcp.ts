export interface WebMcpToolDescriptor {
	name: string;
	description?: string;
	inputSchema?: { type: "object"; properties?: Record<string, unknown> };
}

export interface WebMcpCallResult {
	result: unknown;
	isError?: boolean;
}

/**
 * Thin abstraction over however the browser ends up exposing WebMCP tool
 * calls — deliberately not hard-coupled to `document.modelContext`'s exact
 * shape, which is still an experimental, in-flux API (see the "webmcp" mode
 * tooltip in `ui/mode-switch.tsx` and apps/docs/content/en/drafts/laya-autonomous-webmcp.md). Lets
 * `chat.ts`'s round-trip loop and its tests depend on a stable, narrow
 * interface instead of the real browser API directly.
 */
export interface WebMcpProvider {
	listTools(): Promise<WebMcpToolDescriptor[]>;
	callTool(
		name: string,
		args: Record<string, unknown>,
	): Promise<WebMcpCallResult>;
	/**
	 * Calls `listener` whenever the page's tool list may have changed (tools
	 * come and go with page state); returns the unsubscribe. Absent when the
	 * browser gives no such signal.
	 */
	onToolsChange?(listener: () => void): () => void;
}

interface RawWebMcpTool {
	name: string;
	description?: string;
	inputSchema?: unknown;
}

/**
 * The real spec surface (confirmed 2026-09-29 against
 * `apps/shopping-cart-webmcp`'s `skills/grocery-staples/scripts/webmcp-bridge.js`,
 * a working caller against a real `document.modelContext`): **`getTools()`**
 * (async, re-read on every call — tools come and go with page state) and
 * **`executeTool(tool, argsJson)`**, which takes the *tool object itself*
 * (not just its name) plus a **JSON-stringified** arguments string, and
 * answers with either a JSON string or a plain MCP-shaped result object.
 * There is no `callTool(name, args)` — an earlier version of this file
 * guessed that shape and, as a result, never actually detected a real
 * `document.modelContext` (its feature-detection checked for a `callTool`
 * method that plain never exists, so the provider factory always
 * returned `undefined`, silently disabling the whole feature even with a
 * fully working extension present). No `registerTool` here — that's the
 * *site's own* half (`useWebMCP`/`document.modelContext.registerTool`,
 * `use-webmcp-tool`), a different direction entirely.
 */
interface RawModelContext {
	addEventListener?: (type: string, listener: () => void) => void;
	removeEventListener?: (type: string, listener: () => void) => void;
	getTools?: () => Promise<RawWebMcpTool[]> | RawWebMcpTool[];
	executeTool?: (tool: RawWebMcpTool, argsJson: string) => Promise<unknown>;
}

function parseInputSchema(value: unknown): WebMcpToolDescriptor["inputSchema"] {
	const candidate =
		typeof value === "string"
			? (() => {
					try {
						return JSON.parse(value);
					} catch {
						return undefined;
					}
				})()
			: value;
	return typeof candidate === "object" &&
		candidate !== null &&
		(candidate as { type?: unknown }).type === "object"
		? (candidate as WebMcpToolDescriptor["inputSchema"])
		: undefined;
}

/** `executeTool`'s answer is a JSON string, or already the parsed MCP-shaped `{content, isError}` object — either way, `isError` (if present) is what the round trip needs; the rest just travels as `result`. */
function parseToolResult(raw: unknown): WebMcpCallResult {
	let value = raw;
	if (typeof raw === "string") {
		try {
			value = JSON.parse(raw);
		} catch {
			return { result: raw };
		}
	}
	const isError =
		typeof value === "object" &&
		value !== null &&
		(value as { isError?: unknown }).isError === true;
	return { result: value, isError };
}

/**
 * Best-effort binding to the in-page WebMCP tool registry on
 * `document.modelContext` (the spec moved it off `navigator`; the legacy
 * `navigator.modelContext` is ignored). Native, extension-injected or our
 * polyfill (`@repo/webmcp-polyfill`). Returns `undefined` without a real
 * `getTools`/`executeTool` pair, so the whole feature degrades to a no-op
 * like any missing optional capability.
 */
export function createDocumentWebMcpProvider(): WebMcpProvider | undefined {
	const host = globalThis as {
		document?: { modelContext?: RawModelContext };
	};
	const raw = host.document?.modelContext;
	if (
		!raw ||
		typeof raw.getTools !== "function" ||
		typeof raw.executeTool !== "function"
	) {
		return undefined;
	}
	const getTools = raw.getTools.bind(raw);
	const executeTool = raw.executeTool.bind(raw);

	return {
		async listTools() {
			const tools = (await getTools()) ?? [];
			return tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: parseInputSchema(tool.inputSchema),
			}));
		},
		onToolsChange(listener) {
			// `toolchange`: the event `use-webmcp-tool`-style pages dispatch when tools mount/unmount.
			raw.addEventListener?.("toolchange", listener);
			return () => raw.removeEventListener?.("toolchange", listener);
		},
		async callTool(name, args) {
			const tools = (await getTools()) ?? [];
			const tool = tools.find((candidate) => candidate.name === name);
			if (!tool) {
				return {
					result: `no tool named "${name}" is currently registered`,
					isError: true,
				};
			}
			return parseToolResult(await executeTool(tool, JSON.stringify(args)));
		},
	};
}
