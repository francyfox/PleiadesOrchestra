import { createToolDiscovery } from "./discovery.ts";
import { createToolExecutor } from "./execute-tool.ts";
import { createToolRegistry } from "./registry.ts";
import { createRemoteBridge } from "./remote-bridge.ts";
import type { ModelContextApi, PolyfillDeps } from "./types.ts";

type Handler = EventListenerOrEventListenerObject | null;

/** Defines a spec-style `on<type>` property that swaps its single listener. */
function defineEventHandler(target: EventTarget, type: string): void {
	let current: Handler = null;
	Object.defineProperty(target, `on${type}`, {
		configurable: true,
		get: () => current,
		set: (h: Handler) => {
			if (current) target.removeEventListener(type, current);
			current = h;
			if (h) target.addEventListener(type, h);
		},
	});
}

/**
 * Builds `document.modelContext`: a plain EventTarget extended with the
 * WebMCP API, composed from registry, discovery, remote bridge and executor.
 */
export function createModelContext(deps: PolyfillDeps): ModelContextApi {
	const target = new EventTarget();
	for (const type of ["toolchange", "toolactivated", "toolcancel"])
		defineEventHandler(target, type);

	const registry = createToolRegistry(deps.win, () =>
		target.dispatchEvent(new Event("toolchange")),
	);
	const remote = createRemoteBridge(deps);

	return Object.assign(target, {
		registerTool: registry.register,
		getTools: createToolDiscovery(deps.win, remote),
		executeTool: createToolExecutor(deps.win, remote),
	}) as unknown as ModelContextApi;
}
