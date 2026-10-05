import type { ToolMode } from "@/lib/chat/chat.ts";
import type { Strings } from "@/lib/i18n/i18n.ts";

export interface ModeSwitchOptions {
	s: Strings;
	onChange: (mode: ToolMode) => void;
}

/**
 * Which tool integration the site uses — a standing preference (persisted by
 * `chat.setToolMode`), not part of any one message. WebMCP gets a
 * question-mark hint: it needs the browser itself to expose
 * `navigator.modelContext`, MCP doesn't (the site's tools are reached
 * server-side instead).
 */
export function createModeSwitchModel({ s, onChange }: ModeSwitchOptions) {
	return {
		s,
		toolMode: "webmcp" as ToolMode,
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
	};
}
