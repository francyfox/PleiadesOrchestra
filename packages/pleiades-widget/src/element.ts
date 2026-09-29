import { createWidgetApi } from "./lib/api";
import { type Chat, createChat } from "./lib/chat";
import {
	describeConfigError,
	normalizePosition,
	resolveConfig,
} from "./lib/config";
import { pickLang, strings } from "./lib/i18n";
import { createSessionStore } from "./lib/storage";
import css from "./ui/styles.css?inline";
import { createUi, type Ui } from "./ui/ui";

/** Mirrors the server's `WIDGET_MAX_TEXT_CHARS` default. */
const MAX_CHARS = 2000;

/** Property name → attribute name. Everything is configured through attributes. */
const ATTRIBUTES = {
	agentUrl: "agent-url",
	publishableKey: "publishable-key",
	position: "position",
	heading: "heading",
	greeting: "greeting",
	placeholder: "placeholder",
	lang: "lang",
} as const;

type Prop = keyof typeof ATTRIBUTES;

/**
 * `<pleiades-chat agent-url="…" publishable-key="pk_…">` — a launcher button
 * and a side panel with the chat, in a shadow root so the host page's CSS
 * can't reach it. All state lives in `lib/chat`; this class only wires
 * attributes to it and mounts `ui/`.
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

	#root = this.attachShadow({ mode: "open" });
	#chat?: Chat;
	#scope = "";
	#ui?: Ui;
	#off?: () => void;
	#pending = false;
	#timer?: ReturnType<typeof setTimeout>;

	attributeChangedCallback(name: string) {
		if (name === "open") this.#syncOpen();
		else this.#schedule();
	}

	connectedCallback() {
		this.#schedule();
	}

	disconnectedCallback() {
		this.#off?.();
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

		const scope = `${config.config.agentUrl} ${config.config.publishableKey}`;
		if (!this.#chat || scope !== this.#scope) {
			this.#chat = createChat({
				api: createWidgetApi(config.config),
				store: createSessionStore(config.config),
				maxChars: MAX_CHARS,
			});
			this.#scope = scope;
		}
		const chat = this.#chat;
		const s =
			strings[
				pickLang(
					attr("lang") || document.documentElement.lang || navigator.language,
				)
			];
		const ui = createUi({
			s,
			position: normalizePosition(attr("position")),
			heading: attr("heading") || s.title,
			greeting: attr("greeting") || s.hello,
			placeholder: attr("placeholder") || s.ph,
			maxChars: MAX_CHARS,
			onToggle: () => this.toggle(),
			onClose: () => {
				this.open = false;
			},
			onSend: (text) => void chat.send(text),
			onStop: () => chat.stop(),
			onModeChange: (mode) => chat.setToolMode(mode),
		});
		this.#ui = ui;
		this.#off = chat.subscribe(ui.render);
		ui.render(chat.state);
		const style = document.createElement("style");
		style.textContent = css;
		this.#root.replaceChildren(style, ui.el);
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
