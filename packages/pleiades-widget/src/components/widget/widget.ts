import Alpine from "@alpinejs/csp";
import type { ChatState } from "@/lib/chat/chat.ts";
import type { Position } from "@/lib/config/config.ts";
import type { Lang, Strings } from "@/lib/i18n/i18n.ts";
import type { Dictation } from "@/lib/speech/speech.ts";
import { createComposer } from "../composer/composer.ts";
import { createErrorLine } from "../error-line/error-line.ts";
import { footerTemplate } from "../footer/footer.template.ts";
import { createHeader } from "../header/header.ts";
import { createLauncher } from "../launcher/launcher.ts";
import { createMessages } from "../messages/messages.ts";
import { createNotice } from "../notice/notice.ts";
import { movePanel } from "../panel/panel.motion.ts";
import { createPanel } from "../panel/panel.ts";
import { createProgress } from "../progress/progress.ts";

export interface WidgetOptions {
	s: Strings;
	/** For message times. */
	lang: Lang;
	position: Position;
	heading: string;
	greeting: string;
	placeholder: string;
	maxChars: number;
	onToggle: () => void;
	onClose: () => void;
	/** The visitor picked a language in the header. */
	onLang: (lang: Lang) => void;
	onSend: (text: string) => void;
	onStop: () => void;
	/** The notice about unfinished work: run the held tool, answer it as failed, send the lost prompt again. */
	onContinue: () => void;
	onCancel: () => void;
	onRetry: () => void;
	/** Things to try, shown until the first message (up to three). */
	examples: readonly string[];
	/** Speech-to-text for the microphone button, if the browser has it. */
	dictation?: Dictation;
	/** The shortcuts as written for tooltips; empty = none. */
	shortcuts: { toggle: string; keyshortcuts?: string; mic: string };
}

/**
 * The whole widget, in the shadow root: launcher button + side panel on the
 * same side. It only assembles the components (each owns its model, its
 * template and, where it moves, its motion) and hands them the chat's
 * state. Alpine is started per widget on its own root (`initTree`), never
 * `Alpine.start()`: that would scan the host page's own `x-data`.
 */
export function createWidget(options: WidgetOptions) {
	const { s } = options;
	const el = document.createElement("div");
	const part = (selector: string) => el.querySelector<HTMLElement>(selector);

	const launcher = createLauncher({
		s,
		onToggle: options.onToggle,
		shortcut: options.shortcuts.toggle,
		keyshortcuts: options.shortcuts.keyshortcuts,
	});
	const header = createHeader({
		s,
		lang: options.lang,
		heading: options.heading,
		onClose: options.onClose,
		onLang: options.onLang,
	});
	const messages = createMessages(options.greeting, {
		s,
		lang: options.lang,
		examples: options.examples,
		onAsk: options.onSend,
	});
	const errorLine = createErrorLine(s);
	const progress = createProgress(s);
	const notice = createNotice({
		s,
		onContinue: options.onContinue,
		onCancel: options.onCancel,
		onRetry: options.onRetry,
	});
	const composer = createComposer({
		s,
		placeholder: options.placeholder,
		maxChars: options.maxChars,
		dictation: options.dictation,
		micShortcut: options.shortcuts.mic,
		onSend: options.onSend,
		onStop: options.onStop,
		afterSend: () => part("[part=input]")?.focus(),
	});
	const panel = createPanel(
		{ heading: options.heading, onClose: options.onClose },
		[
			header.html,
			messages.html,
			errorLine.html,
			notice.html,
			progress.html,
			composer.html,
			footerTemplate(),
		],
	);

	el.className = "widget";
	el.dataset.pos = options.position;
	el.innerHTML = launcher.html + panel.html;

	const side = options.position.endsWith("left") ? "left" : "right";
	let started = false;
	let isOpen = false;
	/** One timer for every relative time, a minute apart, while the panel is open. */
	let minuteTimer: ReturnType<typeof setInterval> | undefined;
	/** One timer for the running time of the progress bar, a second apart, while a queue runs. */
	let secondTimer: ReturnType<typeof setInterval> | undefined;
	const syncMinuteTimer = () => {
		clearInterval(minuteTimer);
		minuteTimer = isOpen
			? setInterval(() => messages.model.refresh(), 60_000)
			: undefined;
	};
	const syncSecondTimer = () => {
		const want = progress.model.running;
		if (want && secondTimer === undefined)
			secondTimer = setInterval(() => progress.model.tick(Date.now()), 1000);
		else if (!want && secondTimer !== undefined) {
			clearInterval(secondTimer);
			secondTimer = undefined;
		}
	};

	return {
		el,
		/** Call once the element is in the shadow root. */
		start() {
			if (started) return;
			started = true;
			Alpine.initTree(el);
		},
		destroy() {
			if (started) Alpine.destroyTree(el);
			started = false;
			isOpen = false;
			syncMinuteTimer();
			progress.model.running = false;
			syncSecondTimer();
		},
		render(state: ChatState) {
			messages.render(state.messages, state.busy, el);
			progress.model.render(state.progress, Date.now());
			syncSecondTimer();
			notice.model.render(state.notice);
			errorLine.model.render(state.error, state.errorHint, state.noTools);
			composer.model.render(state);
		},
		/** After a language switch rebuilt the widget: the picker is where the visitor was. */
		focusLang() {
			part("[part=lang-select]")?.focus();
		},
		/** The microphone shortcut: starts or stops dictation. */
		toggleMic() {
			composer.model.toggleMic();
		},
		setOpen(open: boolean) {
			const panelEl = part(".panel");
			const launcherEl = part(".launcher");
			if (!panelEl || !launcherEl) return;
			launcher.model.open = open;
			isOpen = open;
			syncMinuteTimer();
			if (open) messages.model.refresh();
			movePanel(el, panelEl, launcherEl, side, open);
			if (open) part("[part=input]")?.focus();
		},
	};
}

export type Widget = ReturnType<typeof createWidget>;
