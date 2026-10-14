import { getLocalTools } from "./local-tools.ts";
import type { createRemoteBridge } from "./remote-bridge.ts";
import type { AnyWindow, GetToolsOptions, NormalizedTool } from "./types.ts";

/** This window, its parent and siblings, and every iframe on the page. */
export function collectWindows(win: AnyWindow): Set<Window> {
	const all = new Set<Window>([win as unknown as Window]);
	if (win.parent) {
		all.add(win.parent);
		try {
			for (let i = 0; i < win.parent.frames.length; i++)
				all.add(win.parent.frames[i] as Window);
		} catch {
			/* cross-origin */
		}
	}
	try {
		for (const iframe of win.document.querySelectorAll<HTMLIFrameElement>(
			"iframe",
		)) {
			if (iframe.contentWindow) all.add(iframe.contentWindow);
		}
	} catch {
		/* cross-origin */
	}
	return all;
}

/**
 * Origins we trust: iframes the page explicitly permits with allow="tools",
 * plus origins named by the caller. Remote windows are only ever asked at
 * (and answered from) these origins.
 */
export function trustedOriginsOf(
	win: AnyWindow,
	fromOrigins: unknown,
): Set<string> {
	const trusted = new Set<string>();
	for (const iframe of win.document.querySelectorAll<HTMLIFrameElement>(
		'iframe[allow~="tools"]',
	)) {
		try {
			const src = iframe.getAttribute("src");
			if (src) trusted.add(new URL(src, win.location.href).origin);
		} catch {
			/* ignore invalid URLs */
		}
	}
	if (Array.isArray(fromOrigins)) for (const o of fromOrigins) trusted.add(o);
	return trusted;
}

function isSameOrigin(w: Window): boolean {
	try {
		return !!(w as unknown as AnyWindow).document;
	} catch {
		return false; /* cross-origin */
	}
}

/** First tool per name wins. */
export function dedupeByName(tools: NormalizedTool[]): NormalizedTool[] {
	const seen = new Set<string>();
	return tools.filter((t) => !seen.has(t.name) && seen.add(t.name));
}

/** `getTools()`: local + same-origin frames + remote frames, trusted origins only. */
export function createToolDiscovery(
	win: AnyWindow,
	remote: Pick<ReturnType<typeof createRemoteBridge>, "getTools">,
) {
	return async (options: GetToolsOptions = {}): Promise<NormalizedTool[]> => {
		const trusted = trustedOriginsOf(win, options?.fromOrigins);
		const found: NormalizedTool[] = [];
		const pending: Promise<NormalizedTool[]>[] = [];
		for (const w of collectWindows(win)) {
			if (w === (win as unknown as Window) || isSameOrigin(w))
				found.push(...getLocalTools(w as unknown as AnyWindow));
			else pending.push(remote.getTools(w, trusted));
		}
		for (const batch of await Promise.all(pending)) found.push(...batch);
		return dedupeByName(found).filter(
			(t) => t.origin === win.origin || trusted.has(t.origin),
		);
	};
}
