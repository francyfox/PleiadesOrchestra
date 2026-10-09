import type { ChatState } from "@/lib/chat/chat.ts";
import type { Strings } from "@/lib/i18n/i18n.ts";
import type { Dictation } from "@/lib/speech/speech.ts";

export interface ComposerOptions {
	s: Strings;
	placeholder: string;
	maxChars: number;
	onSend: (text: string) => void;
	onStop: () => void;
	/** Runs right after a message is sent: the place to give the input its focus back. */
	afterSend?: () => void;
	/** Speech-to-text for the microphone button; absent where the browser has none (no button then). */
	dictation?: Dictation;
	/** The microphone's shortcut as written for a tooltip (`Ctrl+Shift+Space`). */
	micShortcut?: string;
}

/**
 * The message box: Enter sends, Shift+Enter adds a line, IME composition is
 * left alone. While a reply streams, the submit button turns into a stop
 * button (same slot, no layout shift) — submitting then stops instead of sends.
 */
export function createComposerModel(options: ComposerOptions) {
	const { s } = options;
	/** Which listening the handlers belong to: a result that arrives after the message was sent must not refill the box. */
	let session = 0;
	return {
		placeholder: options.placeholder,
		maxChars: options.maxChars,
		draft: "",
		busy: false,
		/** Blocks sending outright (forbidden, or the connection is down) — distinct from `busy`, which the stop button must stay clickable through. */
		locked: false,
		inputDisabled: false,
		listening: false,
		/** The browser refused the microphone: the button stays but cannot be used. */
		micBlocked: false,

		get micAvailable() {
			return options.dictation !== undefined;
		},
		get micDisabled() {
			return !this.micAvailable || this.micBlocked || this.inputDisabled;
		},
		get micLabel() {
			if (!this.micAvailable) return s.micUnsupported;
			if (this.micBlocked) return s.micBlocked;
			const label = this.listening ? s.micStop : s.mic;
			return options.micShortcut ? `${label} (${options.micShortcut})` : label;
		},
		get micClass() {
			return this.listening ? "mic on" : "mic";
		},
		/** Starts dictation (what is said is added after what was typed) or stops it. */
		toggleMic() {
			const dictation = options.dictation;
			if (!dictation || this.micDisabled) return;
			if (this.listening) {
				dictation.stop();
				return;
			}
			const typed = this.draft.trimEnd();
			const prefix = typed ? `${typed} ` : "";
			const mine = ++session;
			this.listening = true;
			dictation.start({
				onText: (text) => {
					if (mine === session) this.draft = `${prefix}${text.trimStart()}`;
				},
				onEnd: (error) => {
					if (mine !== session) return;
					this.listening = false;
					if (error === "not-allowed" || error === "service-not-allowed")
						this.micBlocked = true;
				},
			});
		},

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
			if (this.listening) {
				session++;
				this.listening = false;
				options.dictation?.stop();
			}
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
