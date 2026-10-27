import {
	ApiError,
	isAbortError,
	type StreamEvent,
	type WidgetApi,
} from "@/lib/api/api.ts";
import { decidePending, type HeldCall } from "@/lib/chat/pending.ts";
import type { CustomerContext } from "@/lib/config/config.ts";
import type { SessionStore } from "@/lib/storage/storage.ts";
import type { WebMcpProvider } from "@/lib/webmcp/webmcp.ts";

export type ChatError =
	| "forbidden"
	/** `402`: the site's plan or balance ran out. Terminal like `forbidden`; never says why. */
	| "suspended"
	| "rate_limited"
	| "too_long"
	| "network"
	/** The server answered but could not do what was asked (nothing found, a tool refused) — fix the request. */
	| "request"
	/** Something broke on the server's side. */
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
	/** Epoch ms: the server's time for loaded messages, the client's for new ones. */
	createdAt?: number;
	/** What the assistant did to produce this reply, in order. Only on replies that used tools. */
	steps?: ChatStep[];
	/** On a visitor message that picked an option: the reply it answered (≤2000 chars). */
	replyTo?: string;
}

/**
 * How a turn ended, as `send()` reports it: `done` — the run reached its goal;
 * `failed` — the server worked but the site could not do the task (`task_failed`);
 * `error` — anything else (busy, not connected, too long, a server fault, a stop).
 */
export interface SendResult {
	/**
	 * The plan run that opens admin `/flow/<id>`: the first run of the turn. The
	 * stream carries it only as the `callId` of a `tool_call` line, so it is
	 * missing for a turn that used no browser-side tool.
	 */
	requestId?: string;
	/** The final assistant text of the turn. */
	reply: string;
	/** The flow lines shown for the turn. */
	steps: { text: string; phase: ChatStep["phase"] }[];
	status: "done" | "failed" | "error";
	/** For `failed`: the site's own advice if it gave one; for `error`: what went wrong. */
	error?: string;
}

/** A message of several tasks: how far the queue is. Times are the client's clock. */
export interface ChatProgress {
	done: number;
	total: number;
	current: string;
	startedAt: number;
	/** Set once the turn is over: the time stops here. */
	endedAt?: number;
}

/** `resume`: a tool call that only the visitor can let through (Continue / Cancel). `cancelled`: what Cancel left behind. `retry`: the request is lost, send its prompt again (empty prompt = nothing to send). */
export type ChatNotice =
	| { kind: "resume"; tasksLeft: number }
	/** Cancel was taken: the request ended, and the action may have happened already. */
	| { kind: "cancelled" }
	| { kind: "retry"; prompt: string; tasksLeft: number };

export interface ChatState {
	messages: ChatMessage[];
	/** Only for a turn of two or more tasks; gone when the next message is sent. */
	progress?: ChatProgress;
	/** Unfinished work the server told about after a reload or a lost connection; gone when anything is sent. */
	notice?: ChatNotice;
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
	/** For a `request` error: what the site advised (its own last answer), if it said anything. */
	errorHint?: string;
	/** The browser has no WebMCP provider — nothing to do for the visitor; the widget says so and sends nothing. */
	noTools: boolean;
}

interface ChatOptions {
	api: WidgetApi;
	store: SessionStore;
	/**
	 * The in-page WebMCP tool caller, if the browser exposes one (see
	 * `webmcp.ts`) — undefined in every real browser today.
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
		case 402:
			return "suspended";
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

/** What a finished stream means for the chat's error line: nothing, or what went wrong. */
function errorOf(
	result: "ok" | "failed" | "request" | "cancelled",
): ChatError | undefined {
	return result === "ok" || result === "cancelled" ? undefined : result;
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
		noTools: !webmcp,
	};
	const listeners = new Set<(state: ChatState) => void>();
	let session: Session | undefined;
	let initPromise: Promise<void> | undefined;
	/** The site's advice from the last `task_failed` line, until `send` reads it. */
	let requestHint: string | undefined;
	let counter = 0;
	/** The first `tool_call` id of the turn in progress = its first plan run id. */
	let turnRequestId: string | undefined;
	/** The server took the visitor's Cancel during this turn. */
	let turnCancelled = false;
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
				void checkPending();
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
				createdAt: item.createdAt,
				...(item.steps ? { steps: item.steps } : {}),
			}))
			.slice(-maxMessages);

		await syncWebMcpTools();
		watchWebMcpTools();
	}

	/**
	 * Registers this thread's current WebMCP tool catalog with the server —
	 * once here (panel open), never per message: a real catalog is several kB
	 * on its own, and reclassifying it through Laya on every message was
	 * both wasteful and, combined with the size, what caused a `413` on the
	 * very first message. A listing/registration failure (offline, an
	 * unstable/half-implemented `document.modelContext`) just means no
	 * tools this session, not a broken open.
	 */
	async function syncWebMcpTools(onlyIfChanged = false): Promise<void> {
		// No provider at all (every real browser today — see webmcp.ts): never
		// anything to register or clear, so skip the network call entirely
		// rather than sending an empty catalog on every single panel open.
		if (!session || !webmcp) return;
		// shortcut: tool mode fixed to webmcp, upgrade when the channel setting (cabinet/admin) exists
		const tools = await webmcp.listTools().catch(() => []);
		// A `toolchange` that left the catalog as it was costs no request.
		const key = `${session.threadId}:${JSON.stringify(tools)}`;
		if (onlyIfChanged && key === lastAnnounced) return;
		// The polyfill gives every page a `document.modelContext`: an empty list
		// is sent only to clear tools this thread was told about.
		// shortcut: a thread restored after a reload is not cleared by a page with
		// no tools, upgrade when the server keeps catalogs across visits.
		const toldThisThread =
			lastAnnounced?.startsWith(`${session.threadId}:`) &&
			lastAnnounced !== `${session.threadId}:[]`;
		if (tools.length === 0 && !toldThisThread) {
			lastAnnounced = key;
			return;
		}
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
			() => {
				update({ ready: true, error: undefined });
				void checkPending();
			},
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
		/** Continue a call the server already waits on instead of sending `text` (`cancel`: answer it as failed). */
		resume?: HeldCall & { cancel?: boolean },
		replyTo?: string,
	): Promise<"ok" | "failed" | "request" | "cancelled"> {
		let stream = resume
			? undefined
			: api.streamMessage(
					current.visitorToken,
					current.threadId,
					text,
					signal,
					customerContext,
					page?.(),
					replyTo,
				);
		let toolCall: (HeldCall & { cancel?: boolean }) | undefined = resume;
		while (true) {
			if (stream) toolCall = undefined;
			for await (const event of stream ?? []) {
				onEvent();
				if (event.type === "delta") {
					target.content += event.text;
					emit();
				} else if (event.type === "step") {
					target.steps = withStep(target.steps, event);
					emit();
				} else if (event.type === "progress") {
					trackProgress(event);
					emit();
				} else if (event.type === "cancelled") {
					turnCancelled = true;
					return "cancelled";
				} else if (event.type === "error") {
					if (event.code === "task_failed") {
						requestHint = event.hint;
						return "request";
					}
					return "failed";
				} else if (event.type === "tool_call") {
					toolCall = event;
					turnRequestId ??= event.callId;
				}
			}
			if (!toolCall) return "ok";
			if (!webmcp && !toolCall.cancel) return "failed";

			// Cancel is not a failed tool: the tool may have run already, so the server only closes the request.
			const cancel = toolCall.cancel === true;
			const { result, isError } =
				cancel || !webmcp
					? { result: "", isError: false }
					: await webmcp.callTool(toolCall.tool, toolCall.arguments);
			stream = api.sendToolResult(
				current.visitorToken,
				current.threadId,
				toolCall.callId,
				toolCall.tool,
				result,
				isError ?? false,
				signal,
				page?.(),
				cancel,
			);
		}
	}

	/** The server's clock may differ from ours: keep our time of the first line (same server `startedAt` = same queue). */
	let progressServerStart: number | undefined;
	function trackProgress(event: Extract<StreamEvent, { type: "progress" }>) {
		const same = progressServerStart === event.startedAt && state.progress;
		progressServerStart = event.startedAt;
		state.progress = {
			done: event.done,
			total: event.total,
			current: event.current,
			startedAt: same ? same.startedAt : now(),
		};
	}

	async function send(
		raw: string,
		customerContext?: CustomerContext,
		/** No new message: carry on a call the server waits on (`resumePending`, `checkPending`). */
		resume?: HeldCall & { cancel?: boolean },
		/** The assistant message this text answers (a picked option), sent as `replyTo`. */
		replyTo?: string,
	): Promise<SendResult> {
		const text = raw.trim();
		const refused = (error: string): SendResult => ({
			reply: "",
			steps: [],
			status: "error",
			error,
		});
		if (!text && !resume) return refused("empty");
		if (state.busy) return refused("busy");
		if (state.connection === "offline") return refused("not connected");
		if (text.length > maxChars) {
			update({ error: "too_long" });
			return refused("too_long");
		}
		turnRequestId = undefined;
		turnCancelled = false;
		state.notice = undefined;
		state.progress = undefined;
		progressServerStart = undefined;
		state.busy = true;
		state.error = undefined;
		state.errorHint = undefined;
		requestHint = undefined;
		emit();

		await init();
		if (!session) {
			update({ busy: false });
			return refused(state.error ?? "not connected");
		}

		const user: ChatMessage = {
			id: nextId(),
			role: "user",
			content: text,
			createdAt: now(),
			...(replyTo ? { replyTo } : {}),
		};
		const assistant: ChatMessage = {
			id: nextId(),
			role: "assistant",
			content: "",
			createdAt: now(),
		};
		state.messages = [
			...state.messages,
			...(text ? [user] : []),
			assistant,
		].slice(-maxMessages);
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
				outcome = errorOf(
					await readReply(
						text,
						session,
						assistant,
						controller.signal,
						resetIdleTimer,
						customerContext,
						resume,
						replyTo,
					),
				);
			} catch (cause) {
				if (isAbortError(cause)) throw cause;
				// A stale token is fixed once, and only if nothing was streamed yet.
				if (!isUnauthorized(cause) || hasOutput(assistant)) throw cause;
				session = await renew();
				outcome = errorOf(
					await readReply(
						text,
						session,
						assistant,
						controller.signal,
						resetIdleTimer,
						customerContext,
						resume,
						replyTo,
					),
				);
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

		const result: SendResult = {
			...(turnRequestId ? { requestId: turnRequestId } : {}),
			reply: assistant.content,
			steps: (assistant.steps ?? []).map(({ text, phase }) => ({
				text,
				phase,
			})),
			status:
				cleanStop || turnCancelled
					? "error"
					: outcome === undefined
						? "done"
						: outcome === "request"
							? "failed"
							: "error",
			...(turnCancelled
				? { error: "cancelled" }
				: cleanStop
					? { error: "stopped" }
					: outcome === "request"
						? requestHint
							? { error: requestHint }
							: {}
						: outcome
							? { error: outcome }
							: {}),
		};

		// A reply that is only a flow (a task that failed, say) is still worth showing.
		if (!hasOutput(assistant)) {
			state.messages = state.messages.filter(
				(message) => message !== assistant,
			);
		}
		// Read through the type: TS thinks `progress` is still the cleared value of the top of `send`.
		const progress = state.progress as ChatProgress | undefined;
		if (progress) progress.endedAt = now();
		update({
			busy: false,
			...(turnCancelled ? { notice: { kind: "cancelled" as const } } : {}),
			error: cleanStop ? undefined : outcome,
			errorHint: outcome === "request" && !cleanStop ? requestHint : undefined,
		});
		return result;
	}

	/** The call a `resume` notice is about. */
	let held: HeldCall | undefined;

	/**
	 * Asks the server what it still holds for this thread — after a reload and
	 * after a lost connection. Nothing is replayed by itself, except a call
	 * that only reads and exists on this page; everything else becomes a notice.
	 * A server without the route (or any failure) means no notice.
	 */
	async function checkPending(): Promise<void> {
		if (!session || state.busy) return;
		const { visitorToken, threadId } = session;
		try {
			const pending = await api.pending(visitorToken, threadId);
			if (state.busy || session?.threadId !== threadId) return;
			const onPage =
				pending.state === "waiting" && webmcp
					? (await webmcp.listTools()).some(
							(tool) => tool.name === pending.tool,
						)
					: false;
			const action = decidePending(pending, onPage);
			if (pending.state === "waiting") {
				held = {
					tool: pending.tool,
					arguments: pending.arguments,
					callId: pending.callId,
				};
			}
			if (action.do === "run" && held) void send("", undefined, held);
			else if (action.do === "ask")
				update({ notice: { kind: "resume", tasksLeft: action.tasksLeft } });
			else if (action.do === "retry")
				update({
					notice: {
						kind: "retry",
						prompt: action.prompt,
						tasksLeft: action.tasksLeft,
					},
				});
		} catch {
			// No notice: the next open asks again.
		}
	}

	/** Continue (`cancel` false) or give up on the held call. */
	async function resumePending(cancel: boolean): Promise<void> {
		if (!held) return;
		const call = held;
		held = undefined;
		await send("", undefined, { ...call, cancel });
	}

	/** Aborts the reply in progress, if any — the partial text already streamed is kept, no error is shown. */
	function stop(): void {
		if (!activeSend) return;
		activeSend.stoppedByUser = true;
		activeSend.controller.abort();
	}

	/**
	 * A new conversation for the same visitor: a new thread, an empty panel.
	 * The server keeps a conversation's facts per thread (which store, the last
	 * product), so a page that swaps one app for another (demos on one page)
	 * calls this instead of carrying them over. The visitor stays: a new one
	 * per switch would run into the server's new-visitor limit. Never rejects —
	 * a failure shows up in `state.error`, like a failed open.
	 */
	async function resetSession(): Promise<void> {
		stop();
		const hadSession = session !== undefined;
		await init();
		// Nothing was said yet: the session just opened is already a fresh one.
		if (!session || !hadSession) return;
		try {
			const thread = await api.createThread(session.visitorToken);
			store.save({ threadId: thread.threadId });
			session = { ...session, threadId: thread.threadId };
		} catch (cause) {
			try {
				if (!isUnauthorized(cause)) throw cause;
				await renew();
			} catch (failure) {
				const code = errorCodeOf(failure);
				if (code === "network") goOffline();
				update({ error: code });
				return;
			}
		}
		update({ messages: [], error: undefined, errorHint: undefined });
		await syncWebMcpTools();
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
		/** Notice buttons: run the held tool and go on, or answer it as failed. */
		continuePending: () => resumePending(false),
		cancelPending: () => resumePending(true),
		/** Notice button: send the lost request's prompt again as a new message. */
		retryPending(customerContext?: CustomerContext): Promise<SendResult> {
			const notice = state.notice;
			return notice?.kind === "retry"
				? send(notice.prompt, customerContext)
				: Promise.resolve({
						reply: "",
						steps: [],
						status: "error",
						error: "nothing to retry",
					});
		},
		stop,
		resetSession,
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
