import { ApiError, isAbortError, type WidgetApi } from "@/lib/api/api.ts";
import type { CustomerContext } from "@/lib/config/config.ts";
import type { SessionStore, ToolMode } from "@/lib/storage/storage.ts";
import type { WebMcpProvider } from "@/lib/webmcp/webmcp.ts";

export type { ToolMode } from "@/lib/storage/storage.ts";

export type ChatError =
	| "forbidden"
	| "rate_limited"
	| "too_long"
	| "network"
	| "failed";

/** One line of the flow shown above a reply: what was done, or is being done. */
export interface ChatStep {
	id: string;
	phase: "running" | "done" | "failed";
	text: string;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	/** What the assistant did to produce this reply, in order. Only on replies that used tools. */
	steps?: ChatStep[];
}

export interface ChatState {
	messages: ChatMessage[];
	/** A visitor session and thread exist and the history is loaded. */
	ready: boolean;
	/** A reply is being generated. */
	busy: boolean;
	/**
	 * "offline" once a request fails to reach the server at all (down, or the
	 * visitor is offline) — distinct from `error`, which is per-attempt and
	 * cleared by the next `send`. Sending is blocked while offline; a
	 * background ping loop flips this back to "online" on its own once the
	 * server is reachable again, no user action needed.
	 */
	connection: "online" | "offline";
	error?: ChatError;
	/** Which tool integration the site uses — a standing preference, not tied to any one conversation. Defaults to "webmcp". */
	toolMode: ToolMode;
}

interface ChatOptions {
	api: WidgetApi;
	store: SessionStore;
	/**
	 * The in-page WebMCP tool caller, if the browser exposes one (see
	 * `webmcp.ts`) — undefined in every real browser today, and even when
	 * present only actually used while `state.toolMode === "webmcp"` (`send`
	 * checks this on every call, not just once at creation, since the mode
	 * can change without recreating `Chat`).
	 */
	webmcp?: WebMcpProvider;
	/**
	 * The visitor's current page (`currentPage`), read at the moment of every
	 * request — never cached: a tool call may navigate, and the next request
	 * must say where the visitor is by then, otherwise the server could send a
	 * navigation the page has already done.
	 */
	page?: () => string | undefined;
	now?: () => number;
	/** Mirrors the server's `WIDGET_MAX_TEXT_CHARS`. */
	maxChars?: number;
	/** No event (not even a `delta`) for this long while a reply streams is treated as a dead connection, not a slow model. */
	idleTimeoutMs?: number;
	/** How often to probe the server while offline. */
	pingIntervalMs?: number;
	/** Pause after the last `toolchange` before the catalog is announced again (a page mounting several tools fires a burst). Default 300. */
	toolChangeDebounceMs?: number;
	/** Kept in the panel at once, oldest dropped first — mirrors the server's own `MESSAGE_RETENTION_PER_USER` (10), which already bounds what `history()` returns on init; this bounds what a single long-running session accumulates client-side afterwards. */
	maxMessages?: number;
}

interface Session {
	visitorToken: string;
	threadId: string;
}

const isUnauthorized = (cause: unknown) =>
	cause instanceof ApiError && cause.status === 401;

function errorCodeOf(cause: unknown): ChatError {
	if (!(cause instanceof ApiError)) return "failed";
	switch (cause.status) {
		case 0:
			return "network";
		case 403:
			return "forbidden";
		case 413:
			return "too_long";
		case 429:
			return "rate_limited";
		default:
			return "failed";
	}
}

/**
 * The widget's conversation logic, independent of any UI: it owns the
 * visitor session (token + thread, restored from the store), the message
 * list and the error state, and notifies subscribers on every change.
 */
/** Whether anything of the reply reached the visitor yet: text or flow lines. */
function hasOutput(message: ChatMessage): boolean {
	return message.content !== "" || (message.steps?.length ?? 0) > 0;
}

/** The steps with `step` added, or — same `id` — replacing its earlier line in place. */
function withStep(steps: ChatStep[] | undefined, step: ChatStep): ChatStep[] {
	const line: ChatStep = { id: step.id, phase: step.phase, text: step.text };
	const list = steps ?? [];
	const at = list.findIndex((known) => known.id === step.id);
	return at === -1
		? [...list, line]
		: list.map((known, i) => (i === at ? line : known));
}

export function createChat({
	api,
	store,
	webmcp,
	page,
	now = Date.now,
	maxChars = 2000,
	idleTimeoutMs = 15_000,
	pingIntervalMs = 5000,
	maxMessages = 10,
	toolChangeDebounceMs = 300,
}: ChatOptions) {
	const state: ChatState = {
		messages: [],
		ready: false,
		busy: false,
		connection: "online",
		toolMode: store.loadToolMode() ?? "webmcp",
	};
	const listeners = new Set<(state: ChatState) => void>();
	let session: Session | undefined;
	let initPromise: Promise<void> | undefined;
	let counter = 0;
	let pingTimer: ReturnType<typeof setInterval> | undefined;
	/** The in-flight `send()`, if any — `stop()` flags it before aborting so the abort is told apart from an idle-timeout one. */
	let activeSend:
		| { controller: AbortController; stoppedByUser: boolean }
		| undefined;

	const emit = () => {
		for (const listener of listeners) listener(state);
	};
	const update = (patch: Partial<ChatState>) => {
		Object.assign(state, patch);
		emit();
	};
	const nextId = () => `local-${++counter}`;

	function stopPingLoop() {
		if (pingTimer === undefined) return;
		clearInterval(pingTimer);
		pingTimer = undefined;
	}

	/** Reaches the server with whatever's cheapest right now — existing history, or a fresh visitor if there's no session yet. */
	async function pingOnce(): Promise<boolean> {
		try {
			if (session) await api.history(session.visitorToken, session.threadId);
			else await api.createVisitor();
			return true;
		} catch (cause) {
			if (!isUnauthorized(cause)) return false;
			try {
				session = await renew();
				return true;
			} catch {
				return false;
			}
		}
	}

	/**
	 * Flips to "offline" and starts probing in the background until the
	 * server answers again — the caller never has to retry by hand. A
	 * Node/Bun timer is unref'd so it can never keep a process alive (a
	 * no-op in the browser, where this actually runs).
	 */
	function goOffline() {
		if (state.connection === "offline") return;
		update({ connection: "offline" });
		stopPingLoop();
		pingTimer = setInterval(() => {
			void pingOnce().then((reachable) => {
				if (!reachable) return;
				stopPingLoop();
				update({ connection: "online", error: undefined });
			});
		}, pingIntervalMs);
		const unref = (pingTimer as unknown as { unref?: () => void }).unref;
		unref?.call(pingTimer);
	}

	async function startSession(): Promise<Session> {
		const visitor = await api.createVisitor();
		store.save({
			visitorToken: visitor.visitorToken,
			expiresAt: visitor.expiresAt,
		});
		const thread = await api.createThread(visitor.visitorToken);
		store.save({ threadId: thread.threadId });
		return { visitorToken: visitor.visitorToken, threadId: thread.threadId };
	}

	/** The token was refused (expired, revoked): forget it and begin as a new visitor. */
	async function renew(): Promise<Session> {
		store.clear();
		session = await startSession();
		return session;
	}

	async function open(): Promise<void> {
		const stored = store.load(now());
		if (stored.visitorToken && stored.threadId) {
			session = {
				visitorToken: stored.visitorToken,
				threadId: stored.threadId,
			};
		} else if (stored.visitorToken) {
			const thread = await api.createThread(stored.visitorToken);
			store.save({ threadId: thread.threadId });
			session = {
				visitorToken: stored.visitorToken,
				threadId: thread.threadId,
			};
		} else {
			session = await startSession();
		}

		let history: Awaited<ReturnType<WidgetApi["history"]>>;
		try {
			history = await api.history(session.visitorToken, session.threadId);
		} catch (cause) {
			if (!isUnauthorized(cause)) throw cause;
			await renew();
			history = { items: [] };
		}
		state.messages = history.items
			.map((item) => ({
				id: `h-${item.id}`,
				role: item.role,
				content: item.content,
			}))
			.slice(-maxMessages);

		await syncWebMcpTools();
		watchWebMcpTools();
	}

	/**
	 * Registers this thread's current WebMCP tool catalog with the server —
	 * once here (panel open) and once more from `setToolMode` (mode switched
	 * while already open), never per message: a real catalog is several kB
	 * on its own, and reclassifying it through Laya on every message was
	 * both wasteful and, combined with the size, what caused a `413` on the
	 * very first message. A listing/registration failure (offline, an
	 * unstable/half-implemented `navigator.modelContext`) just means no
	 * tools this session, not a broken open/mode switch.
	 */
	async function syncWebMcpTools(onlyIfChanged = false): Promise<void> {
		// No provider at all (every real browser today — see webmcp.ts): never
		// anything to register or clear, so skip the network call entirely
		// rather than sending an empty catalog on every single panel open.
		if (!session || !webmcp) return;
		const tools =
			state.toolMode === "webmcp"
				? await webmcp.listTools().catch(() => [])
				: [];
		// A `toolchange` that left the catalog as it was costs no request.
		const key = `${session.threadId}:${JSON.stringify(tools)}`;
		if (onlyIfChanged && key === lastAnnounced) return;
		lastAnnounced = key;
		await api
			.registerWebMcpTools(session.visitorToken, session.threadId, tools)
			.catch(() => {});
	}

	/** What was last announced to the server (thread + catalog), to skip repeats. */
	let lastAnnounced: string | undefined;
	let stopWatching: (() => void) | undefined;
	let announceTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Announces the catalog again when the page's tools change while the panel
	 * is open (the server only learns them on open otherwise). Debounced: a
	 * page mounting several tools fires a burst of events.
	 */
	function watchWebMcpTools(): void {
		if (stopWatching || !webmcp?.onToolsChange) return;
		stopWatching = webmcp.onToolsChange(() => {
			clearTimeout(announceTimer);
			announceTimer = setTimeout(
				() => void syncWebMcpTools(true),
				toolChangeDebounceMs,
			);
		});
	}

	function init(): Promise<void> {
		initPromise ??= open().then(
			() => update({ ready: true, error: undefined }),
			(cause) => {
				initPromise = undefined;
				const code = errorCodeOf(cause);
				if (code === "network") goOffline();
				update({ ready: false, error: code });
			},
		);
		return initPromise;
	}

	/**
	 * Consumes one NDJSON stream, then — if it ended on a `tool_call` line
	 * instead of `done`/`error` — executes the WebMCP tool in-browser and
	 * loops onto a fresh stream via `sendToolResult`, until a real `done`/
	 * `error` is reached (or there's no way to run the tool at all, which is
	 * itself just another `"failed"`, not a hang — see `webmcp.ts`).
	 */
	async function readReply(
		text: string,
		current: Session,
		target: ChatMessage,
		signal: AbortSignal,
		onEvent: () => void,
		customerContext?: CustomerContext,
	): Promise<"ok" | "failed"> {
		let stream = api.streamMessage(
			current.visitorToken,
			current.threadId,
			text,
			signal,
			customerContext,
			page?.(),
		);
		while (true) {
			let toolCall:
				| { tool: string; arguments: Record<string, unknown>; callId: string }
				| undefined;
			for await (const event of stream) {
				onEvent();
				if (event.type === "delta") {
					target.content += event.text;
					emit();
				} else if (event.type === "step") {
					target.steps = withStep(target.steps, event);
					emit();
				} else if (event.type === "error") {
					return "failed";
				} else if (event.type === "tool_call") {
					toolCall = event;
				}
			}
			if (!toolCall) return "ok";
			if (!webmcp) return "failed";

			const { result, isError } = await webmcp.callTool(
				toolCall.tool,
				toolCall.arguments,
			);
			stream = api.sendToolResult(
				current.visitorToken,
				current.threadId,
				toolCall.callId,
				toolCall.tool,
				result,
				isError ?? false,
				signal,
				page?.(),
			);
		}
	}

	async function send(
		raw: string,
		customerContext?: CustomerContext,
	): Promise<void> {
		const text = raw.trim();
		if (!text || state.busy || state.connection === "offline") return;
		if (text.length > maxChars) {
			update({ error: "too_long" });
			return;
		}
		state.busy = true;
		state.error = undefined;
		emit();

		await init();
		if (!session) {
			update({ busy: false });
			return;
		}

		const user: ChatMessage = { id: nextId(), role: "user", content: text };
		const assistant: ChatMessage = {
			id: nextId(),
			role: "assistant",
			content: "",
		};
		state.messages = [...state.messages, user, assistant].slice(-maxMessages);
		emit();

		const controller = new AbortController();
		const active = { controller, stoppedByUser: false };
		activeSend = active;
		let idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs);
		const resetIdleTimer = () => {
			clearTimeout(idleTimer);
			idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs);
		};

		let outcome: ChatError | undefined;
		let cleanStop = false;
		try {
			try {
				outcome =
					(await readReply(
						text,
						session,
						assistant,
						controller.signal,
						resetIdleTimer,
						customerContext,
					)) === "failed"
						? "failed"
						: undefined;
			} catch (cause) {
				if (isAbortError(cause)) throw cause;
				// A stale token is fixed once, and only if nothing was streamed yet.
				if (!isUnauthorized(cause) || hasOutput(assistant)) throw cause;
				session = await renew();
				outcome =
					(await readReply(
						text,
						session,
						assistant,
						controller.signal,
						resetIdleTimer,
						customerContext,
					)) === "failed"
						? "failed"
						: undefined;
			}
		} catch (cause) {
			if (isAbortError(cause)) {
				if (active.stoppedByUser) {
					// A deliberate stop — whatever streamed so far stays, no error shown.
					cleanStop = true;
				} else {
					// The idle timer fired: no event for `idleTimeoutMs` reads as a dead connection.
					goOffline();
					outcome = "network";
				}
			} else {
				outcome = errorCodeOf(cause);
				if (outcome === "network") goOffline();
			}
		} finally {
			clearTimeout(idleTimer);
			if (activeSend === active) activeSend = undefined;
		}

		// A reply that is only a flow (a task that failed, say) is still worth showing.
		if (!hasOutput(assistant)) {
			state.messages = state.messages.filter(
				(message) => message !== assistant,
			);
		}
		update({ busy: false, error: cleanStop ? undefined : outcome });
	}

	/** Aborts the reply in progress, if any — the partial text already streamed is kept, no error is shown. */
	function stop(): void {
		if (!activeSend) return;
		activeSend.stoppedByUser = true;
		activeSend.controller.abort();
	}

	function setToolMode(mode: ToolMode): void {
		store.saveToolMode(mode);
		update({ toolMode: mode });
		// Only meaningful once a session exists — if the panel hasn't opened
		// yet, `open()` reads the now-updated `state.toolMode` on its own.
		void syncWebMcpTools();
	}

	return {
		api,
		get state() {
			return state;
		},
		subscribe(listener: (state: ChatState) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		init,
		send,
		stop,
		setToolMode,
		/** Stops following the page's tool changes (the element left the document). */
		dispose(): void {
			clearTimeout(announceTimer);
			stopWatching?.();
			stopWatching = undefined;
		},
		/** For the site's server-side `identify` call: the current visitor token. */
		async getVisitorToken(): Promise<string | undefined> {
			await init();
			return session?.visitorToken;
		},
	};
}

export type Chat = ReturnType<typeof createChat>;
