/**
 * Serializes async work sharing the same key, lets different keys run
 * concurrently. Not for cross-user concurrency (`plan()`/`runPlan()` already
 * hold no shared mutable state across calls, so different threads never
 * need this) — for the one case that does: two overlapping `runPlan` calls
 * on the *same* thread racing over the same live WebMCP session/tab. Queued
 * per key, not per process: safe within a single `alpha-orchestrator`
 * instance; a multi-instance deployment needs a real distributed lock
 * instead, which this deliberately isn't.
 */
export interface RunLock {
	withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export function createRunLock(): RunLock {
	const queues = new Map<string, Promise<unknown>>();

	return {
		withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
			const previous = queues.get(key) ?? Promise.resolve();
			// Chained onto `previous` regardless of whether it rejected — one
			// caller's failure must not wedge the queue for the next.
			const result = previous.then(fn, fn);
			// Settled copy tracked as the queue tail; `result` itself keeps `fn`'s
			// real rejection for the caller awaiting it.
			const tail = result.then(
				() => {},
				() => {},
			);
			queues.set(key, tail);
			// Once nothing queued behind this call, drop the key — an unbounded
			// map keyed by threadId would otherwise leak forever.
			void tail.then(() => {
				if (queues.get(key) === tail) queues.delete(key);
			});

			return result;
		},
	};
}
