/** The slice of `WebSocket` the stream needs — lets tests pass a fake. */
export interface StreamSocket {
	onopen: ((event: Event) => void) | null;
	onmessage: ((event: MessageEvent) => void) | null;
	onclose: ((event: CloseEvent) => void) | null;
	close(): void;
}

export interface SystemStreamOptions<T> {
	url: string;
	connect: (url: string) => StreamSocket;
	onSnapshot: (snapshot: T) => void;
	/** `true` when the socket opens or is stopped on purpose, `false` when it drops unasked. */
	onStatus?: (up: boolean) => void;
	/** Delays before successive reconnects; the last one repeats. */
	backoffMs?: readonly number[];
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (id: unknown) => void;
}

const STREAM_PATH = "/api/system/stream";
const DEFAULT_BACKOFF_MS = [1000, 2000, 5000, 15000];

/** `ws(s)://` twin of the panel's own origin — `/api` is same-origin, so the session cookie rides along. */
export function streamUrl(origin: string): string {
	return `${origin.replace(/^http/, "ws")}${STREAM_PATH}`;
}

/**
 * A reconnecting WebSocket feed. `start()` while the tab is visible,
 * `stop()` when it isn't: a stopped stream holds no socket and no timer, so
 * a hidden tab costs the server nothing.
 */
export function createSystemStream<T>(options: SystemStreamOptions<T>) {
	const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
	const setTimer =
		options.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown);
	const clearTimer =
		options.clearTimer ??
		((id) => clearTimeout(id as ReturnType<typeof setTimeout>));

	let running = false;
	let socket: StreamSocket | null = null;
	let timer: unknown = null;
	let attempt = 0;

	function open() {
		const current = options.connect(options.url);
		socket = current;
		current.onopen = () => {
			if (socket !== current) return;
			attempt = 0;
			options.onStatus?.(true);
		};
		current.onmessage = (event) => {
			if (socket !== current) return;
			try {
				options.onSnapshot(JSON.parse(String(event.data)) as T);
			} catch {
				// Not a snapshot — the next message replaces it anyway.
			}
		};
		current.onclose = () => {
			if (socket !== current) return;
			socket = null;
			if (!running) return;
			options.onStatus?.(false);
			const delay = backoff[Math.min(attempt, backoff.length - 1)] ?? 1000;
			attempt += 1;
			timer = setTimer(() => {
				timer = null;
				if (running) open();
			}, delay);
		};
	}

	return {
		start() {
			if (running) return;
			running = true;
			open();
		},
		stop() {
			running = false;
			attempt = 0;
			if (timer !== null) {
				clearTimer(timer);
				timer = null;
			}
			const current = socket;
			socket = null;
			current?.close();
			options.onStatus?.(true);
		},
	};
}
