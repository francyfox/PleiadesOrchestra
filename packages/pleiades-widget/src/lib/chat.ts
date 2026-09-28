import { ApiError, type WidgetApi } from "./api";
import type { SessionStore } from "./storage";

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
	error?: ChatError;
}

interface ChatOptions {
	api: WidgetApi;
	store: SessionStore;
	now?: () => number;
	/** Mirrors the server's `WIDGET_MAX_TEXT_CHARS`. */
	maxChars?: number;
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
}: ChatOptions) {
	const state: ChatState = { messages: [], ready: false, busy: false };
	const listeners = new Set<(state: ChatState) => void>();
	let session: Session | undefined;
	let initPromise: Promise<void> | undefined;
	let counter = 0;

	const emit = () => {
		for (const listener of listeners) listener(state);
	};
	const update = (patch: Partial<ChatState>) => {
		Object.assign(state, patch);
		emit();
	};
	const nextId = () => `local-${++counter}`;

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
		state.messages = history.items.map((item) => ({
			id: `h-${item.id}`,
			role: item.role,
			content: item.content,
		}));
	}

	function init(): Promise<void> {
		initPromise ??= open().then(
			() => update({ ready: true, error: undefined }),
			(cause) => {
				initPromise = undefined;
				update({ ready: false, error: errorCodeOf(cause) });
			},
		);
		return initPromise;
	}

	async function readReply(
		text: string,
		current: Session,
		target: ChatMessage,
	): Promise<"ok" | "failed"> {
		for await (const event of api.streamMessage(
			current.visitorToken,
			current.threadId,
			text,
		)) {
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
		if (!text || state.busy) return;
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
		state.messages = [...state.messages, user, assistant];
		emit();

		let outcome: ChatError | undefined;
		try {
			try {
				outcome =
					(await readReply(text, session, assistant)) === "failed"
						? "failed"
						: undefined;
			} catch (cause) {
				// A stale token is fixed once, and only if nothing was streamed yet.
				if (!isUnauthorized(cause) || assistant.content) throw cause;
				outcome =
					(await readReply(text, await renew(), assistant)) === "failed"
						? "failed"
						: undefined;
			}
		} catch (cause) {
			outcome = errorCodeOf(cause);
		}

		if (!assistant.content) {
			state.messages = state.messages.filter(
				(message) => message !== assistant,
			);
		}
		update({ busy: false, error: outcome });
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
		/** For the site's server-side `identify` call: the current visitor token. */
		async getVisitorToken(): Promise<string | undefined> {
			await init();
			return session?.visitorToken;
		},
	};
}

export type Chat = ReturnType<typeof createChat>;
