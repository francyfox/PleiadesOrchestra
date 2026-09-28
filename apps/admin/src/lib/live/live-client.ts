import type {
	LiveClientMessage,
	LiveErrorCode,
	LiveServerMessage,
	LiveTopic,
	LiveTopics,
} from "admin-api/types";

/** The slice of `WebSocket` the client needs — lets tests pass a fake. */
export interface LiveSocket {
	onopen: ((event: Event) => void) | null;
	onmessage: ((event: MessageEvent) => void) | null;
	onclose: ((event: CloseEvent) => void) | null;
	send(data: string): void;
	close(): void;
}

export interface LiveHandlers<T extends LiveTopic> {
	onData(data: LiveTopics[T]["data"]): void;
	onError?(code: LiveErrorCode): void;
}

export interface LiveClientOptions {
	url: string;
	connect: (url: string) => LiveSocket;
	isVisible: () => boolean;
	/** `true` when the socket opens or is closed on purpose, `false` when it drops (or never connects) unasked. */
	onStatus?: (up: boolean) => void;
	/** Subscribes to tab visibility changes; returns the unsubscribe. */
	onVisibilityChange?: (callback: () => void) => () => void;
	/** Delays before successive reconnects; the last one repeats. */
	backoffMs?: readonly number[];
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (id: unknown) => void;
}

const LIVE_PATH = "/api/live";
const DEFAULT_BACKOFF_MS = [1000, 2000, 5000, 15000];

/** `ws(s)://` twin of the panel's own origin — `/api` is same-origin, so the session cookie rides along. */
export function liveUrl(origin: string): string {
	return `${origin.replace(/^http/, "ws")}${LIVE_PATH}`;
}

interface Subscription {
	topic: LiveTopic;
	params: object;
	handlers: LiveHandlers<LiveTopic>;
}

/**
 * One multiplexed WebSocket for every live subscription of the page in view.
 * It exists only while there is something subscribed AND the tab is visible:
 * a page nobody is looking at costs the server nothing. Every (re)connect
 * re-sends the active subscriptions, and the server answers each with a fresh snapshot.
 */
export function createLiveClient(options: LiveClientOptions) {
	const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
	const setTimer =
		options.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown);
	const clearTimer =
		options.clearTimer ??
		((id) => clearTimeout(id as ReturnType<typeof setTimeout>));

	const subscriptions = new Map<string, Subscription>();
	let socket: LiveSocket | null = null;
	let isOpen = false;
	let timer: unknown = null;
	let attempt = 0;
	let counter = 0;

	const send = (message: LiveClientMessage) => {
		if (socket && isOpen) socket.send(JSON.stringify(message));
	};

	function closeSocket() {
		const current = socket;
		socket = null;
		isOpen = false;
		current?.close();
	}

	function cancelReconnect() {
		if (timer !== null) {
			clearTimer(timer);
			timer = null;
		}
	}

	function open() {
		const current = options.connect(options.url);
		socket = current;
		current.onopen = () => {
			if (socket !== current) return;
			isOpen = true;
			attempt = 0;
			options.onStatus?.(true);
			for (const [id, subscription] of subscriptions) {
				send({
					type: "subscribe",
					id,
					topic: subscription.topic,
					params: subscription.params,
				} as LiveClientMessage);
			}
		};
		current.onmessage = (event) => {
			if (socket !== current) return;
			let message: LiveServerMessage;
			try {
				message = JSON.parse(String(event.data)) as LiveServerMessage;
			} catch {
				return;
			}
			const subscription =
				typeof message?.id === "string"
					? subscriptions.get(message.id)
					: undefined;
			if (!subscription) return;
			if (message.type === "data")
				subscription.handlers.onData(message.data as never);
			else if (message.type === "error")
				subscription.handlers.onError?.(message.code);
		};
		current.onclose = () => {
			if (socket !== current) return;
			socket = null;
			isOpen = false;
			// A close we did not ask for: the next attempt waits a little longer (an open resets this).
			attempt += 1;
			options.onStatus?.(false);
			sync();
		};
	}

	/** Brings the socket in line with "something is subscribed and the tab is visible". */
	function sync() {
		const wanted = subscriptions.size > 0 && options.isVisible();
		if (!wanted) {
			cancelReconnect();
			closeSocket();
			attempt = 0;
			// Nothing depends on the connection now, so an earlier "down" no longer applies.
			options.onStatus?.(true);
			return;
		}
		if (socket || timer !== null) return;
		if (attempt === 0) {
			open();
			return;
		}
		const delay = backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 1000;
		timer = setTimer(() => {
			timer = null;
			if (subscriptions.size > 0 && options.isVisible() && !socket) open();
		}, delay);
	}

	const stopVisibility = options.onVisibilityChange?.(() => sync());

	return {
		subscribe<T extends LiveTopic>(
			topic: T,
			params: LiveTopics[T]["params"],
			handlers: LiveHandlers<T>,
		): () => void {
			const id = `s${++counter}`;
			subscriptions.set(id, {
				topic,
				params,
				handlers: handlers as LiveHandlers<LiveTopic>,
			});
			if (socket && isOpen)
				send({ type: "subscribe", id, topic, params } as LiveClientMessage);
			else sync();
			return () => {
				if (!subscriptions.delete(id)) return;
				send({ type: "unsubscribe", id });
				sync();
			};
		},
		stop() {
			subscriptions.clear();
			stopVisibility?.();
			cancelReconnect();
			closeSocket();
			attempt = 0;
			options.onStatus?.(true);
		},
	};
}

export type LiveClient = ReturnType<typeof createLiveClient>;
