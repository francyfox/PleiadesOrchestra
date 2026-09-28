import type { ChatState } from "../lib/chat";
import type { Strings } from "../lib/i18n";
import { h } from "./jsx";

/** The message box: Enter sends, Shift+Enter adds a line, IME composition is left alone. */
export function Composer({
	s,
	placeholder,
	maxChars,
	onSend,
}: {
	s: Strings;
	placeholder: string;
	maxChars: number;
	onSend: (text: string) => void;
}) {
	const input = (
		<textarea
			rows="1"
			maxlength={maxChars}
			placeholder={placeholder}
			aria-label={placeholder}
		/>
	) as HTMLTextAreaElement;
	const button = (
		<button type="submit" disabled>
			{s.send}
		</button>
	) as HTMLButtonElement;
	let locked = false;

	const sync = () => {
		button.disabled = locked || input.value.trim() === "";
	};
	const submit = () => {
		if (button.disabled) return;
		onSend(input.value);
		input.value = "";
		sync();
	};

	input.addEventListener("input", sync);
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			submit();
		}
	});
	const el = (
		<form
			onSubmit={(event: Event) => {
				event.preventDefault();
				submit();
			}}
		>
			{input}
			{button}
		</form>
	) as HTMLFormElement;

	return {
		el,
		focus: () => input.focus(),
		/** Locked while a reply is streaming, and for good when the server refuses this site. */
		render(state: ChatState) {
			locked = state.busy || state.error === "forbidden";
			input.disabled = state.error === "forbidden";
			sync();
		},
	};
}
