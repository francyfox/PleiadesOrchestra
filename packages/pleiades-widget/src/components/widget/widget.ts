import Alpine from "@alpinejs/csp";
import type { ChatState, ToolMode } from "@/lib/chat/chat.ts";
import type { Position } from "@/lib/config/config.ts";
import type { Strings } from "@/lib/i18n/i18n.ts";
import type { Dictation } from "@/lib/speech/speech.ts";
import { createComposer } from "../composer/composer.ts";
import { createErrorLine } from "../error-line/error-line.ts";
import { footerTemplate } from "../footer/footer.template.ts";
import { createHeader } from "../header/header.ts";
import { createLauncher } from "../launcher/launcher.ts";
import { createMessages } from "../messages/messages.ts";
import { createModeSwitch } from "../mode-switch/mode-switch.ts";
import { movePanel } from "../panel/panel.motion.ts";
import { createPanel } from "../panel/panel.ts";

export interface WidgetOptions {
	s: Strings;
	position: Position;
	heading: string;
	greeting: string;
	placeholder: string;
	maxChars: number;
	onToggle: () => void;
	onClose: () => void;
	onSend: (text: string) => void;
	onStop: () => void;
	onModeChange: (mode: ToolMode) => void;
	/** Things to try, shown until the first message (up to three). */
	examples: readonly string[];
	/** Speech-to-text for the microphone button, if the browser has it. */
	dictation?: Dictation;
	/** Which tool modes exist (chat's `state.available`); the others are disabled in the switch. */
	available: { webmcp: boolean; mcp: boolean };
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
		heading: options.heading,
		onClose: options.onClose,
	});
	const messages = createMessages(options.greeting, {
		s,
		examples: options.examples,
		onAsk: options.onSend,
	});
	const errorLine = createErrorLine(s);
	const modeSwitch = createModeSwitch({
		s,
		onChange: options.onModeChange,
		webmcpAvailable: options.available.webmcp,
		mcpAvailable: options.available.mcp,
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
			modeSwitch.html,
			composer.html,
			footerTemplate(),
		],
	);

	el.className = "widget";
	el.dataset.pos = options.position;
	el.innerHTML = launcher.html + panel.html;

	const side = options.position.endsWith("left") ? "left" : "right";
	let started = false;

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
		},
		render(state: ChatState) {
			messages.render(state.messages, state.busy, el);
			errorLine.model.render(state.error, state.errorHint, state.noTools);
			modeSwitch.model.render(state.toolMode);
			composer.model.render(state);
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
			movePanel(el, panelEl, launcherEl, side, open);
			if (open) part("[part=input]")?.focus();
		},
	};
}

export type Widget = ReturnType<typeof createWidget>;
