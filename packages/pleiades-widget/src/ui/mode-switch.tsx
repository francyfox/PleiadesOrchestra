import type { ChatState, ToolMode } from "../lib/chat";
import type { Strings } from "../lib/i18n";
import { h } from "./jsx";

/**
 * Which tool integration the site uses — a standing preference (persisted
 * by `chat.setToolMode`), not part of any one message. WebMCP gets a
 * question-mark hint: it needs the browser itself to expose
 * `navigator.modelContext` (Chrome 155+ at the time of writing — this is
 * forward-looking, not yet something most visitors' browsers support), MCP
 * doesn't since the site's tools are reached server-side instead.
 */
export function ModeSwitch({
	s,
	onChange,
}: {
	s: Strings;
	onChange: (mode: ToolMode) => void;
}) {
	const webmcp = (
		<input type="radio" name="pleiades-mode" value="webmcp" id="pl-m-webmcp" />
	) as HTMLInputElement;
	const mcp = (
		<input type="radio" name="pleiades-mode" value="mcp" id="pl-m-mcp" />
	) as HTMLInputElement;

	const pick = () => onChange(webmcp.checked ? "webmcp" : "mcp");
	webmcp.addEventListener("change", pick);
	mcp.addEventListener("change", pick);

	const tip = (
		<span class="tip" role="tooltip" id="pl-webmcp-tip">
			{s.webmcpHint}
		</span>
	) as HTMLSpanElement;
	const hint = (
		<button
			type="button"
			class="q"
			aria-describedby="pl-webmcp-tip"
			aria-label={s.webmcpHint}
		>
			?{tip}
		</button>
	) as HTMLButtonElement;

	const el = (
		<div class="mode" role="radiogroup" aria-label={s.mode}>
			<label for="pl-m-webmcp">
				{webmcp}
				{s.webmcp}
				{hint}
			</label>
			<label for="pl-m-mcp">
				{mcp}
				{s.mcp}
			</label>
		</div>
	) as HTMLDivElement;

	return {
		el,
		render(state: ChatState) {
			webmcp.checked = state.toolMode === "webmcp";
			mcp.checked = state.toolMode === "mcp";
		},
	};
}
