/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Adapted from https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/demos/shared/webmcp-polyfill.js
 * Restructured into small composed modules; the widget calls
 * `installWebMcpPolyfill` explicitly during initialisation instead of running
 * it as a page-level IIFE.
 *
 * Sets up `document.modelContext` on any browser that lacks native WebMCP
 * support. The widget's `createNavigatorWebMcpProvider()` then detects the API
 * and WebMCP works cross-browser via Pleiades as the AI bridge.
 */
import { schedulePseudoClassPolyfill } from "./css-pseudo.ts";
import { getLocalTools } from "./local-tools.ts";
import { createModelContext } from "./model-context.ts";
import { observeDeclarativeTools } from "./observer.ts";
import { createProvider, normalizeOrigins } from "./provider.ts";
import { ToolActivatedEvent, ToolCancelEvent } from "./tool-events.ts";
import type { AnyWindow } from "./types.ts";

export type WebMcpPolyfillOptions = {
	/**
	 * Origins whose windows may list and run this page's tools via
	 * `postMessage`. Empty / omitted: the page exposes nothing to other windows.
	 */
	exposeToolsTo?: readonly string[];
};

/** Replaces the window's allow-list in place (the live message handler shares it). */
function refreshAllowList(
	win: AnyWindow,
	list: readonly string[] | undefined,
): Set<string> {
	win.__webmcp_exposed_origins ??= new Set();
	const exposed = win.__webmcp_exposed_origins;
	exposed.clear();
	for (const o of normalizeOrigins(list)) exposed.add(o);
	return exposed;
}

function defineModelContext(win: AnyWindow, modelContext: unknown): void {
	Object.defineProperty(win.document, "modelContext", {
		value: modelContext,
		writable: false,
		configurable: true,
	});
}

/**
 * Installs `document.modelContext` (WebMCP) on browsers that lack native
 * support. Safe to call multiple times — skips if already present, but always
 * refreshes the `exposeToolsTo` allow-list.
 */
export function installWebMcpPolyfill(
	options: WebMcpPolyfillOptions = {},
): void {
	const win = globalThis as unknown as AnyWindow;
	const exposed = refreshAllowList(win, options.exposeToolsTo);
	if (win.document.modelContext) return;

	win.__webmcp_registered_tools ??= new Map();
	const modelContext = createModelContext({
		win,
		newId: () => crypto.randomUUID(),
	});
	win.ToolActivatedEvent = ToolActivatedEvent;
	win.ToolCancelEvent = ToolCancelEvent;
	defineModelContext(win, modelContext);

	win.addEventListener(
		"message",
		createProvider({
			exposed,
			listLocalTools: () => getLocalTools(win),
			executeTool: modelContext.executeTool,
		}) as unknown as EventListener,
	);
	observeDeclarativeTools(win, () =>
		modelContext.dispatchEvent(new Event("toolchange")),
	);
	schedulePseudoClassPolyfill(win);
}
