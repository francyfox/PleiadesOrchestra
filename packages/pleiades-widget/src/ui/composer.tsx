import type { ChatState } from "../lib/chat";
import type { Strings } from "../lib/i18n";
import { h } from "./jsx";

/**
 * The message box: Enter sends, Shift+Enter adds a line, IME composition is
 * left alone. While a reply streams, the submit button turns into a stop
 * button (same slot, no layout shift) — submitting then calls `onStop`
 * instead of `onSend`.
 */
export function Composer({
	s,
	placeholder,
	maxChars,
	onSend,
	onStop,
}: {
	s: Strings;
	placeholder: string;
	maxChars: number;
	onSend: (text: string) => void;
	onStop: () => void;
}) {
	const input = (
		<textarea
			rows="1"
			maxlength={maxChars}
			placeholder={placeholder}
			aria-label={placeholder}
			part="input"
		/>
	) as HTMLTextAreaElement;
	const button = (
		<button type="submit" part="send" disabled>
			{s.send}
		</button>
	) as HTMLButtonElement;
	let busy = false;
	/** Blocks sending outright (server forbidden, or the connection is known to be down) — distinct from `busy`, which the stop button must stay clickable through. */
	let locked = false;

	const sync = () => {
		if (busy) {
			button.disabled = false;
			button.textContent = s.stop;
			button.classList.add("stop");
			button.setAttribute("aria-label", s.stop);
		} else {
			button.disabled = locked || input.value.trim() === "";
			button.textContent = s.send;
			button.classList.remove("stop");
			button.removeAttribute("aria-label");
		}
	};
	const submit = () => {
		if (busy) {
			onStop();
			return;
		}
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
			part="composer"
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
		render(state: ChatState) {
			busy = state.busy;
			locked = state.error === "forbidden" || state.connection === "offline";
			input.disabled = state.error === "forbidden";
			sync();
		},
	};
}
