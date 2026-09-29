import { ApiError, isAbortError, type WidgetApi } from "./api";
import type { SessionStore, ToolMode } from "./storage";

export type { ToolMode } from "./storage";

export type ChatError =
	| "forbidden"
	| "rate_limited"
	| "too_long"
	| "network"
	| "failed";

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
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
	now?: () => number;
	/** Mirrors the server's `WIDGET_MAX_TEXT_CHARS`. */
	maxChars?: number;
	/** No event (not even a `delta`) for this long while a reply streams is treated as a dead connection, not a slow model. */
	idleTimeoutMs?: number;
	/** How often to probe the server while offline. */
	pingIntervalMs?: number;
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
export function createChat({
	api,
	store,
	now = Date.now,
	maxChars = 2000,
	idleTimeoutMs = 15_000,
	pingIntervalMs = 5000,
	maxMessages = 10,
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

	async function readReply(
		text: string,
		current: Session,
		target: ChatMessage,
		signal: AbortSignal,
		onEvent: () => void,
	): Promise<"ok" | "failed"> {
		for await (const event of api.streamMessage(
			current.visitorToken,
			current.threadId,
			text,
			signal,
		)) {
			onEvent();
			if (event.type === "delta") {
				target.content += event.text;
				emit();
			} else if (event.type === "error") {
				return "failed";
			}
		}
		return "ok";
	}

	async function send(raw: string): Promise<void> {
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
					)) === "failed"
						? "failed"
						: undefined;
			} catch (cause) {
				if (isAbortError(cause)) throw cause;
				// A stale token is fixed once, and only if nothing was streamed yet.
				if (!isUnauthorized(cause) || assistant.content) throw cause;
				session = await renew();
				outcome =
					(await readReply(
						text,
						session,
						assistant,
						controller.signal,
						resetIdleTimer,
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

		if (!assistant.content) {
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
		/** For the site's server-side `identify` call: the current visitor token. */
		async getVisitorToken(): Promise<string | undefined> {
			await init();
			return session?.visitorToken;
		},
	};
}

export type Chat = ReturnType<typeof createChat>;
