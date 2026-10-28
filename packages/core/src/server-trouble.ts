import { AsyncLocalStorage } from "node:async_hooks";

/** Hears every model answer: `false` = overloaded, failing or unreachable (the SDK retries), `true` = answered. */
type Listener = (ok: boolean) => void;

const listeners = new AsyncLocalStorage<Listener>();

/** HTTP attempts one model call made: the SDK retries 429/5xx itself, so a call that took 3 tries otherwise looks clean. */
export interface AttemptTally {
	attempts: number;
	/** Status of each failed attempt; 0 = no response (connection refused). */
	failed: number[];
}

const tallies = new AsyncLocalStorage<AttemptTally>();

export const newTally = (): AttemptTally => ({ attempts: 0, failed: [] });

/** Runs `fn` (a model call); every request inside it counts into `tally`. */
export const tallyingAttempts = <T>(tally: AttemptTally, fn: () => T): T =>
	tallies.run(tally, fn);

/** The tally as the ledger keeps it; empty when no request was made. */
export const attemptsOf = (
	tally: AttemptTally,
): { attempts?: number; failedStatuses?: number[] } =>
	tally.attempts === 0
		? {}
		: {
				attempts: tally.attempts,
				...(tally.failed.length ? { failedStatuses: tally.failed } : {}),
			};

/** Runs `fn`; every model request inside it reports to `listener` (`reportingTrouble`). */
export function watchServerTrouble<T>(
	listener: Listener,
	fn: () => Promise<T>,
): Promise<T> {
	return listeners.run(listener, fn);
}

/**
 * The `fetch` of a model adapter that tells the surrounding `watchServerTrouble`
 * how the server answered, so the visitor can hear why a reply is slow while
 * the SDK retries. `send` is resolved per call (tests swap the global fetch).
 */
export function reportingTrouble(send?: typeof fetch): typeof fetch {
	return (async (...args: Parameters<typeof fetch>) => {
		const listener = listeners.getStore();
		const tally = tallies.getStore();
		if (tally) tally.attempts += 1;
		try {
			const response = await (send ?? fetch)(...args);
			if (!response.ok) tally?.failed.push(response.status);
			if (response.status === 429 || response.status >= 500) listener?.(false);
			else if (response.ok) listener?.(true);
			return response;
		} catch (error) {
			if (!(error instanceof Error && error.name === "AbortError")) {
				tally?.failed.push(0);
				listener?.(false);
			}
			throw error;
		}
	}) as typeof fetch;
}
