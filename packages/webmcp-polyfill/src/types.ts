import type { ToolActivatedEvent, ToolCancelEvent } from "./tool-events.ts";

export interface RawTool {
	name: string;
	description?: string;
	inputSchema?: unknown;
	annotations?: unknown;
	execute?: (args: unknown, options?: unknown) => unknown;
}

export interface NormalizedTool extends RawTool {
	window: AnyWindow;
	origin: string;
	_form?: HTMLFormElement;
	_isRemote?: boolean;
	_execute?: (args: unknown, options?: unknown) => unknown;
}

/** Wire shape of a tool sent to another window. */
export interface SerializableTool {
	name: string;
	description?: string;
	inputSchema?: unknown;
	origin: string;
	annotations?: unknown;
}

export interface ExecuteOptions {
	signal?: AbortSignal;
}

export interface GetToolsOptions {
	fromOrigins?: string[];
}

export interface ModelContextApi extends EventTarget {
	ontoolchange: EventListenerOrEventListenerObject | null;
	ontoolactivated: EventListenerOrEventListenerObject | null;
	ontoolcancel: EventListenerOrEventListenerObject | null;
	registerTool(
		tool: RawTool,
		options?: { signal?: AbortSignal },
	): Promise<void>;
	getTools(options?: GetToolsOptions): Promise<NormalizedTool[]>;
	executeTool(
		tool: NormalizedTool,
		input: unknown,
		options?: ExecuteOptions,
	): Promise<unknown>;
}

export type McpDocument = Document & { modelContext?: ModelContextApi };

export interface AnyWindow extends Omit<Window, "document"> {
	document: McpDocument;
	__webmcp_registered_tools?: Map<string, NormalizedTool>;
	/** Origins allowed to drive this page's tools; refreshed by every install call. */
	__webmcp_exposed_origins?: Set<string>;
	ToolActivatedEvent?: typeof ToolActivatedEvent;
	ToolCancelEvent?: typeof ToolCancelEvent;
}

export interface PolyfillDeps {
	win: AnyWindow;
	/** Request-id generator (unguessable in production). */
	newId: () => string;
}
