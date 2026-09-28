type FetchInput = string | URL | Request;

export interface RetryOptions {
	/** Extra attempts after the first one. */
	retries?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	/** Response statuses worth another try (overload / gateway hiccups). */
	retryStatuses?: readonly number[];
	/** Only idempotent methods are retried: a repeated POST could act twice. */
	retryMethods?: readonly string[];
	onRetry?: (info: {
		attempt: number;
		delayMs: number;
		reason: string;
		method: string;
		url: string;
	}) => void;
	sleep?: (ms: number) => Promise<void>;
	/** Jitter source in [0, 1); injectable for tests. */
	random?: () => number;
}

const DEFAULT_STATUSES = [429, 502, 503, 504] as const;
const DEFAULT_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"] as const;

function requestInfo(input: FetchInput, init?: RequestInit) {
	const method = (
		init?.method ?? (input instanceof Request ? input.method : "GET")
	).toUpperCase();
	const url = input instanceof Request ? input.url : String(input);
	return { method, url };
}

/** Seconds form of `Retry-After` only; an HTTP-date falls back to the backoff. */
function retryAfterMs(response: Response): number | null {
	const seconds = Number(response.headers.get("retry-after"));
	return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/**
 * Wraps `fetch` with retries for network errors and transient statuses,
 * exponential backoff with full jitter, `Retry-After` support. The single
 * outbound-HTTP retry policy for every app (server-to-server clients).
 */
export function retryFetch(
	base: typeof fetch = fetch,
	options: RetryOptions = {},
): typeof fetch {
	const retries = options.retries ?? 2;
	const baseDelayMs = options.baseDelayMs ?? 200;
	const maxDelayMs = options.maxDelayMs ?? 2000;
	const statuses = options.retryStatuses ?? DEFAULT_STATUSES;
	const methods = options.retryMethods ?? DEFAULT_METHODS;
	const sleep =
		options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	const random = options.random ?? Math.random;

	return (async (input: FetchInput, init?: RequestInit) => {
		const { method, url } = requestInfo(input, init);
		const canRetry =
			methods.includes(method) && !(init?.body instanceof ReadableStream);

		for (let attempt = 0; ; attempt++) {
			const last = attempt >= retries;
			let reason: string;
			let retryAfter: number | null = null;
			try {
				const response = await base(input, init);
				// Also covers a caller that already aborted: stop, don't hammer.
				if (
					!canRetry ||
					last ||
					init?.signal?.aborted ||
					!statuses.includes(response.status)
				) {
					return response;
				}
				reason = `status ${response.status}`;
				retryAfter = retryAfterMs(response);
			} catch (error) {
				if (!canRetry || last || init?.signal?.aborted) throw error;
				reason = error instanceof Error ? error.message : String(error);
			}

			const delayMs =
				retryAfter !== null
					? Math.min(retryAfter, maxDelayMs)
					: Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * random();
			options.onRetry?.({ attempt: attempt + 1, delayMs, reason, method, url });
			await sleep(delayMs);
		}
	}) as typeof fetch;
}
