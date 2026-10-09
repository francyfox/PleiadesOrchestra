// `?inline` gives the string this class injects into the shadow root at
// runtime; the plain import (unused otherwise) makes Vite also emit the
// same, identically-processed stylesheet as a standalone `dist/pleiades-widget.css`
// asset — a reference for integrators, see the "Theming" section of the README.
import css from "@/components/styles.css?inline";
import { createWidgetApi } from "@/lib/api/api.ts";
import { type Chat, createChat } from "@/lib/chat/chat.ts";
import {
	describeConfigError,
	normalizePosition,
	parseCustomerContext,
	parseExamples,
	resolveConfig,
} from "@/lib/config/config.ts";
import {
	formatHotkey,
	keyShortcuts,
	parseHotkey,
} from "@/lib/hotkey/hotkey.ts";
import { pickLang, strings } from "@/lib/i18n/i18n.ts";
import { currentPage } from "@/lib/page/page.ts";
import { createDictation, speechLang } from "@/lib/speech/speech.ts";
import { createSessionStore } from "@/lib/storage/storage.ts";
import { createNavigatorWebMcpProvider } from "@/lib/webmcp/webmcp.ts";
import "@/components/styles.css";
import { createWidget, type Widget } from "@/components/widget/widget.ts";

/** Mirrors the server's `WIDGET_MAX_TEXT_CHARS` default. */
const MAX_CHARS = 2000;

/** Ctrl+J, or ⌘J on a Mac: the same shortcut as the demo shop's own assistant. */
const DEFAULT_HOTKEY = "mod+j";
/**
 * Ctrl/⌘+Shift+Space: starts and stops dictation while the panel is open. Not a
 * letter with Alt: Alt+<letter> belongs to browser menus, extensions and, on
 * Linux with Alt+Shift as the layout switch, to the keyboard.
 */
const DEFAULT_MIC_HOTKEY = "mod+shift+space";

/** Property name → attribute name. Everything is configured through attributes. */
const ATTRIBUTES = {
	agentUrl: "agent-url",
	publishableKey: "publishable-key",
	position: "position",
	heading: "heading",
	greeting: "greeting",
	placeholder: "placeholder",
	lang: "lang",
	customerContext: "customer-context",
	examples: "examples",
	hotkey: "hotkey",
	micHotkey: "mic-hotkey",
} as const;

type Prop = keyof typeof ATTRIBUTES;

/**
 * `<pleiades-chat agent-url="…" publishable-key="pk_…">` — a launcher button
 * and a side panel with the chat, in a shadow root so the host page's CSS
 * can't reach it. All state lives in `lib/chat`; this class only wires
 * attributes to it and mounts the widget (`components/`).
 */
export class PleiadesChat extends HTMLElement {
	static observedAttributes = [...Object.values(ATTRIBUTES), "open"];

	declare agentUrl: string;
	declare publishableKey: string;
	declare position: string;
	declare heading: string;
	declare greeting: string;
	declare placeholder: string;
	declare lang: string;
	declare customerContext: string;
	declare examples: string;
	declare hotkey: string;
	declare micHotkey: string;

	#root = this.attachShadow({ mode: "open" });
	#chat?: Chat;
	#scope = "";
	#ui?: Widget;
	#off?: () => void;
	#pending = false;
	#timer?: ReturnType<typeof setTimeout>;

	attributeChangedCallback(name: string) {
		if (name === "open") this.#syncOpen();
		else this.#schedule();
	}

	connectedCallback() {
		document.addEventListener("keydown", this.#onKeyDown);
		this.#schedule();
	}

	/** An attribute's shortcut, or the default while the attribute is absent (an empty one turns it off). */
	#hotkey(attribute: string, fallback: string) {
		return this.hasAttribute(attribute)
			? this.getAttribute(attribute)
			: fallback;
	}

	/**
	 * `hotkey` (default Ctrl/⌘+J) opens and closes the panel; `mic-hotkey`
	 * (default Ctrl/⌘+Shift+Space) starts and stops dictation while it is open.
	 */
	#onKeyDown = (event: KeyboardEvent) => {
		if (!this.#ui || event.repeat) return;
		if (parseHotkey(this.#hotkey("hotkey", DEFAULT_HOTKEY))?.(event)) {
			event.preventDefault();
			this.toggle();
		} else if (
			this.open &&
			parseHotkey(this.#hotkey("mic-hotkey", DEFAULT_MIC_HOTKEY))?.(event)
		) {
			event.preventDefault();
			this.#ui.toggleMic();
		}
	};

	disconnectedCallback() {
		document.removeEventListener("keydown", this.#onKeyDown);
		this.#chat?.dispose();
		this.#off?.();
		this.#ui?.destroy();
		this.#off = this.#chat = this.#ui = undefined;
		this.#scope = "";
		this.#root.replaceChildren();
	}

	get open() {
		return this.hasAttribute("open");
	}

	set open(value: boolean) {
		this.toggleAttribute("open", Boolean(value));
	}

	toggle() {
		this.open = !this.open;
	}

	/** For the site's server-side `identify` call: the visitor token of this browser. */
	getVisitorToken(): Promise<string | undefined> {
		return this.#chat?.getVisitorToken() ?? Promise.resolve(undefined);
	}

	// Attributes arrive one by one while the parser/framework sets them: rebuild once, in a microtask.
	#schedule() {
		if (this.#pending) return;
		this.#pending = true;
		queueMicrotask(() => {
			this.#pending = false;
			if (this.isConnected) this.#mount();
		});
	}

	#mount() {
		const attr = (prop: Prop) => this.getAttribute(ATTRIBUTES[prop]) ?? "";
		const config = resolveConfig({
			agentUrl: attr("agentUrl"),
			publishableKey: attr("publishableKey"),
		});

		clearTimeout(this.#timer);
		this.#off?.();
		this.#ui?.destroy();
		if (!config.ok) {
			this.#chat = this.#ui = this.#off = undefined;
			this.#scope = "";
			this.#root.replaceChildren();
			// Reported on the next tick so half-set attributes don't log a transient error.
			this.#timer = setTimeout(
				() =>
					console.error(
						`[pleiades-widget] ${describeConfigError(config.error)}`,
					),
				0,
			);
			return;
		}

		const webmcp = createNavigatorWebMcpProvider();
		const scope = `${config.config.agentUrl} ${config.config.publishableKey}`;
		if (!this.#chat || scope !== this.#scope) {
			this.#chat = createChat({
				api: createWidgetApi(config.config),
				store: createSessionStore(config.config),
				// Absent in every real browser today (see `webmcp.ts`) — `chat.ts`
				// itself only actually uses this while `toolMode === "webmcp"`,
				// checked per `send()`, not just here, so the mode toggle needs no
				// `#mount()` beyond what already runs for any attribute change.
				webmcp,
				// Read at every request: the page changes under a single-page app.
				page: () => currentPage(),
				maxChars: MAX_CHARS,
			});
			this.#scope = scope;
		}
		const chat = this.#chat;
		const customerContext = parseCustomerContext(attr("customerContext"));
		const lang = pickLang(
			attr("lang") || document.documentElement.lang || navigator.language,
		);
		const s = strings[lang];
		const toggleSpec = this.#hotkey("hotkey", DEFAULT_HOTKEY);
		const ui = createWidget({
			s,
			position: normalizePosition(attr("position")),
			heading: attr("heading") || s.title,
			greeting: attr("greeting") || s.hello,
			placeholder: attr("placeholder") || s.ph,
			examples: parseExamples(attr("examples")) ?? s.examples,
			dictation: createDictation(speechLang(lang)),
			shortcuts: {
				toggle: formatHotkey(toggleSpec),
				keyshortcuts: keyShortcuts(toggleSpec),
				mic: formatHotkey(this.#hotkey("mic-hotkey", DEFAULT_MIC_HOTKEY)),
			},
			maxChars: MAX_CHARS,
			onToggle: () => this.toggle(),
			onClose: () => {
				this.open = false;
			},
			onSend: (text) => void chat.send(text, customerContext),
			onStop: () => chat.stop(),
			onModeChange: (mode) => chat.setToolMode(mode),
			available: chat.state.available,
		});
		this.#ui = ui;
		this.#off = chat.subscribe(ui.render);
		ui.render(chat.state);
		const style = document.createElement("style");
		style.textContent = css;
		this.#root.replaceChildren(style, ui.el);
		// Alpine starts on the element once it is in the shadow root.
		ui.start();
		this.#syncOpen();
	}

	#syncOpen() {
		this.#ui?.setOpen(this.open);
		if (this.open) void this.#chat?.init();
	}
}

for (const [prop, attribute] of Object.entries(ATTRIBUTES)) {
	Object.defineProperty(PleiadesChat.prototype, prop, {
		get(this: PleiadesChat) {
			return this.getAttribute(attribute) ?? "";
		},
		set(this: PleiadesChat, value: unknown) {
			if (value === null || value === undefined)
				this.removeAttribute(attribute);
			else this.setAttribute(attribute, String(value));
		},
	});
}
