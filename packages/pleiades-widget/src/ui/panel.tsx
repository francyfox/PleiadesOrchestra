import type { ChatState, ToolMode } from "../lib/chat";
import type { Strings } from "../lib/i18n";
import { Composer } from "./composer";
import { Footer } from "./footer";
import { Header } from "./header";
import { h } from "./jsx";
import { MessageList } from "./message-list";
import { ModeSwitch } from "./mode-switch";

export interface PanelOptions {
	s: Strings;
	heading: string;
	greeting: string;
	placeholder: string;
	maxChars: number;
	onClose: () => void;
	onSend: (text: string) => void;
	onStop: () => void;
	onModeChange: (mode: ToolMode) => void;
}

/** The side panel: header, conversation, error line, message box, mode switch, branding footer. */
export function Panel({
	s,
	heading,
	greeting,
	placeholder,
	maxChars,
	onClose,
	onSend,
	onStop,
	onModeChange,
}: PanelOptions) {
	const list = MessageList({ greeting });
	const composer = Composer({ s, placeholder, maxChars, onSend, onStop });
	const modeSwitch = ModeSwitch({ s, onChange: onModeChange });
	const error = (
		<p class="error" part="error" role="alert" hidden />
	) as HTMLParagraphElement;
	const el = (
		<div
			class="panel"
			part="panel"
			id="panel"
			role="dialog"
			aria-label={heading}
			inert
			onKeyDown={(event: KeyboardEvent) => event.key === "Escape" && onClose()}
		>
			<Header heading={heading} closeLabel={s.close} onClose={onClose} />
			{list.el}
			{error}
			{modeSwitch.el}
			{composer.el}
			<Footer />
		</div>
	) as HTMLDivElement;

	return {
		el,
		focus: composer.focus,
		setOpen(open: boolean) {
			el.classList.toggle("open", open);
			el.inert = !open;
			if (open) composer.focus();
		},
		render(state: ChatState) {
			list.render(state.messages);
			composer.render(state);
			modeSwitch.render(state);
			error.hidden = !state.error;
			error.textContent = state.error ? s[state.error] : "";
		},
	};
}
