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
	 * Comma-separated origins (`"https://a.example,https://b.example"`) whose
	 * windows may list and run this page's WebMCP tools through `postMessage`
	 * (embedding page, opener, iframe). Off by default: without it no other
	 * window can reach the page's tools. `*` is not accepted.
	 */
	"expose-tools-to"?: string;
	/**
	 * Up to three things to try, shown until the first message: a JSON array of
	 * texts, e.g. `'["Find a jacket","Where is my order?"]'`. `'[]'` hides them;
	 * absent = built-in examples.
	 */
	examples?: string;
	/** Boolean attribute: the panel starts open. */
	open?: boolean;
	/**
	 * Boolean attribute for browser automation / tests: also exposes
	 * `window.pleiadesChat.send(text)`. Off by default — no global on production pages.
	 */
	"test-api"?: boolean;
}

/** How a turn ended: `done` (goal reached), `failed` (the site could not do the task), `error` (busy, not connected, server fault…). */
export interface PleiadesSendResult {
	/** The run that opens admin `/flow/<id>`. Taken from the first `tool_call`; absent for a turn with no browser-side tool call. */
	requestId?: string;
	/** The final assistant text of the turn. */
	reply: string;
	/** The flow lines shown for the turn. */
	steps: { text: string; phase: "running" | "done" | "failed" }[];
	status: "done" | "failed" | "error";
	/** `failed`: the site's own advice, if any. `error`: what went wrong. */
	error?: string;
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
	exposeToolsTo: string;
	/** Reflects the `open` attribute. */
	open: boolean;
	toggle(): void;
	/**
	 * The visitor token of this browser, creating the session if needed — for the
	 * site's server-side `POST /v1/channels/:slug/identify` call. Resolves to
	 * `undefined` while the element is not configured.
	 */
	getVisitorToken(): Promise<string | undefined>;
	/**
	 * Sends `text` exactly like a visitor typing and pressing Send (opens the
	 * panel, same WebMCP tool calls) and resolves when the turn ends. Never
	 * rejects: busy / not connected come back as `status: "error"`.
	 */
	send(text: string): Promise<PleiadesSendResult>;
}

declare global {
	interface Window {
		/** Only with the `test-api` attribute on `<pleiades-chat>`. */
		pleiadesChat?: { send(text: string): Promise<PleiadesSendResult> };
	}
	interface HTMLElementTagNameMap {
		"pleiades-chat": PleiadesChatElement;
	}
}
