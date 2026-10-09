import type { ToolMode } from "@/lib/chat/chat.ts";
import type { Strings } from "@/lib/i18n/i18n.ts";

export interface ModeSwitchOptions {
	s: Strings;
	onChange: (mode: ToolMode) => void;
	/** Whether the browser exposes WebMCP tools (a provider exists). */
	webmcpAvailable: boolean;
	/** Whether the MCP mode can be used; today nothing on the page can say otherwise, so it defaults to true. */
	mcpAvailable?: boolean;
	/** Subscribes to clicks anywhere on the page, returns the unsubscribe. Defaults to `document`. */
	/** Writes text to the clipboard. Defaults to `navigator.clipboard`. */
	copy?: (text: string) => Promise<void>;
	clicks?: (handler: (event: Event) => void) => () => void;
}

/** Where Chrome's WebMCP switch lives. */
export const WEBMCP_FLAG_URL = "chrome://flags/#enable-webmcp-testing";

const pageClicks: NonNullable<ModeSwitchOptions["clicks"]> = (handler) => {
	document.addEventListener("click", handler);
	return () => document.removeEventListener("click", handler);
};

/**
 * Which tool integration the site uses — a standing preference (persisted by
 * `chat.setToolMode`), not part of any one message. WebMCP gets a
 * question-mark hint: it needs the browser itself to expose
 * `navigator.modelContext`, MCP doesn't (the site's tools are reached
 * server-side instead).
 */
export function createModeSwitchModel({
	s,
	onChange,
	webmcpAvailable,
	mcpAvailable = true,
	clicks = pageClicks,
	copy = (text) => navigator.clipboard.writeText(text),
}: ModeSwitchOptions) {
	// Outside the returned object on purpose: Alpine would wrap a DOM node in a reactive proxy.
	let root: Element | null = null;
	let stopCopiedTimer: ReturnType<typeof setTimeout> | undefined;
	let stopListening: (() => void) | undefined;

	return {
		s,
		toolMode: "webmcp" as ToolMode,
		hintOpen: false,
		flagUrl: WEBMCP_FLAG_URL,
		copied: false,
		get linkText() {
			return this.copied ? s.copied : WEBMCP_FLAG_URL;
		},
		get webmcpDisabled() {
			return !webmcpAvailable;
		},
		get mcpDisabled() {
			return !mcpAvailable;
		},
		get isWebmcp() {
			return this.toolMode === "webmcp";
		},
		get isMcp() {
			return this.toolMode === "mcp";
		},
		render(mode: ToolMode) {
			this.toolMode = mode;
		},
		pickMode(event: Event) {
			onChange((event.target as HTMLInputElement).value as ToolMode);
		},
		/** Click on the "?": opens the hint, closes it on the next click anywhere outside the switch. */
		toggleHint(event: Event) {
			if (this.hintOpen) return this.closeHint();
			root = (event.currentTarget as Element).closest(".mode");
			this.hintOpen = true;
			// `composedPath`, not `target`: the widget lives in a shadow root, where `target` is retargeted to the host.
			stopListening = clicks((click) => {
				if (root && !click.composedPath().includes(root)) this.closeHint();
			});
		},
		/** A page can't navigate to chrome:// (the browser blocks it), so a click copies the address to paste into the address bar. */
		async copyFlag(event: Event) {
			event.preventDefault();
			try {
				await copy(WEBMCP_FLAG_URL);
			} catch {
				return;
			}
			this.copied = true;
			clearTimeout(stopCopiedTimer);
			stopCopiedTimer = setTimeout(() => {
				this.copied = false;
			}, 2000);
		},
		closeHint() {
			this.hintOpen = false;
			this.copied = false;
			clearTimeout(stopCopiedTimer);
			stopListening?.();
			stopListening = undefined;
			root = null;
		},
	};
}
