/** Where the launcher button sits; the panel slides in from the same side. */
export type PleiadesPosition =
	| "bottom-left"
	| "bottom-right"
	| "top-left"
	| "top-right";

export type PleiadesLang = "en" | "ru" | "kk";

/** The attributes of `<pleiades-chat>`. Everything is configured through attributes. */
export interface PleiadesChatAttributes {
	/** Base URL of the Pleiades orchestrator. `https` only (plain `http` is accepted for localhost). */
	"agent-url": string;
	/** The channel's PUBLIC key (`pk_…`). Never the secret key (`sk_…`): the widget refuses to start with it. */
	"publishable-key": string;
	/** Default `"bottom-left"`. */
	position?: PleiadesPosition;
	/** Panel title. */
	heading?: string;
	/** First bubble of the conversation. */
	greeting?: string;
	/** Hint in the message box. */
	placeholder?: string;
	/** Default: the page's language, else the browser's; anything unsupported is English. */
	lang?: PleiadesLang;
	/**
	 * Flat JSON object of customer data the site already knows and the browser
	 * can't reliably detect itself, e.g. `'{"country":"Kazakhstan","city":"Qyzylorda"}'`
	 * — forwarded to the orchestrator as extra facts for the store's own GOAP
	 * actions. Values must be strings, numbers or booleans; anything else (or
	 * invalid JSON) is dropped with a console warning, not a fatal error.
	 */
	"customer-context"?: string;
	/**
	 * Keyboard shortcut that opens and closes the panel: modifiers and a key
	 * joined by `+`, e.g. `"mod+j"` (the default; `mod` = Ctrl or ⌘),
	 * `"ctrl+shift+k"`. An empty value turns the shortcut off. The Windows key
	 * can't be used: the OS takes it before the page.
	 */
	hotkey?: string;
	/**
	 * Shortcut that starts and stops dictation while the panel is open; same
	 * format as `hotkey`. Default `"mod+shift+space"`; an empty value turns it off.
	 */
	"mic-hotkey"?: string;
	/**
	 * Up to three things to try, shown until the first message: a JSON array of
	 * texts, e.g. `'["Find a jacket","Where is my order?"]'`. `'[]'` hides them;
	 * absent = built-in examples.
	 */
	examples?: string;
	/** Boolean attribute: the panel starts open. */
	open?: boolean;
}

/** The element itself: the attributes above as properties, plus a small API. */
export interface PleiadesChatElement extends HTMLElement {
	agentUrl: string;
	publishableKey: string;
	position: string;
	heading: string;
	greeting: string;
	placeholder: string;
	lang: string;
	customerContext: string;
	examples: string;
	hotkey: string;
	micHotkey: string;
	/** Reflects the `open` attribute. */
	open: boolean;
	toggle(): void;
	/**
	 * The visitor token of this browser, creating the session if needed — for the
	 * site's server-side `POST /v1/channels/:slug/identify` call. Resolves to
	 * `undefined` while the element is not configured.
	 */
	getVisitorToken(): Promise<string | undefined>;
}

declare global {
	interface HTMLElementTagNameMap {
		"pleiades-chat": PleiadesChatElement;
	}
}
