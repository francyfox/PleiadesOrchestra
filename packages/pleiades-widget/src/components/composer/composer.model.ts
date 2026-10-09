import type { ChatState } from "@/lib/chat/chat.ts";
import type { Strings } from "@/lib/i18n/i18n.ts";

export interface ComposerOptions {
	s: Strings;
	placeholder: string;
	maxChars: number;
	onSend: (text: string) => void;
	onStop: () => void;
	/** Runs right after a message is sent: the place to give the input its focus back. */
	afterSend?: () => void;
}

/**
 * The message box: Enter sends, Shift+Enter adds a line, IME composition is
 * left alone. While a reply streams, the submit button turns into a stop
 * button (same slot, no layout shift) — submitting then stops instead of sends.
 */
export function createComposerModel(options: ComposerOptions) {
	const { s } = options;
	return {
		placeholder: options.placeholder,
		maxChars: options.maxChars,
		draft: "",
		busy: false,
		/** Blocks sending outright (forbidden, or the connection is down) — distinct from `busy`, which the stop button must stay clickable through. */
		locked: false,
		inputDisabled: false,

		get sendDisabled() {
			return this.busy ? false : this.locked || this.draft.trim() === "";
		},
		get sendLabel() {
			return this.busy ? s.stop : s.send;
		},
		get sendClass() {
			return this.busy ? "stop" : "";
		},
		/** `null` removes the attribute: the label is only set on the stop button. */
		get sendAria() {
			return this.busy ? s.stop : null;
		},

		render(state: ChatState) {
			this.busy = state.busy;
			this.locked =
				state.noTools ||
				state.error === "forbidden" ||
				state.connection === "offline";
			this.inputDisabled = state.noTools || state.error === "forbidden";
		},
		submit() {
			if (this.busy) {
				options.onStop();
				return;
			}
			if (this.sendDisabled) return;
			options.onSend(this.draft);
			this.draft = "";
			options.afterSend?.();
		},
		onKey(event: KeyboardEvent) {
			if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
				event.preventDefault();
				this.submit();
			}
		},
	};
}

export type ComposerModel = ReturnType<typeof createComposerModel>;
