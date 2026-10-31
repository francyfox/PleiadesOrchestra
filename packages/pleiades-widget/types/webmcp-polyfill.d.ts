export interface WebMcpPolyfillOptions {
	/** Origins whose windows may list and run this page's tools via `postMessage`. Empty or omitted: none. */
	exposeToolsTo?: readonly string[];
}

/** Installs `document.modelContext` on browsers without native WebMCP. Safe to call repeatedly. */
export declare function installWebMcpPolyfill(
	options?: WebMcpPolyfillOptions,
): void;
