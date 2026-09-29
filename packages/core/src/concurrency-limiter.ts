import type { DecisionAgent } from "./decision-types";
import type { Agent, AgentStreamEvent, IncomingMessage } from "./types";

/**
 * Bounded-parallelism gate for a shared, CPU-bound backend (`beta-text`'s
 * `llama-server`, `gamma-decision`'s onnxruntime) — more concurrent clients
 * than the hardware has threads for just queues at the OS/model-server
 * level regardless of how parallel our own request handling is; this makes
 * that queueing explicit and boundable on our side instead of implicit and
 * unbounded (every request fires a call immediately, the backend falls
 * behind, timeouts cascade). Not GOAP-specific — wrap any `Agent`/
 * `DecisionAgent` call site that shares one backend.
 */
export interface ConcurrencyLimiter {
	run<T>(fn: () => Promise<T>): Promise<T>;
	/** Lower-level pair for callers `run` doesn't fit — e.g. holding a slot for the lifetime of a stream, not just one `Promise`. Matched `acquire`/`release` calls, same contract as `run`. */
	acquire(): Promise<void>;
	release(): void;
}

export function createConcurrencyLimiter(max: number): ConcurrencyLimiter {
	let active = 0;
	const queue: (() => void)[] = [];

	function acquire(): Promise<void> {
		if (active < max) {
			active++;
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			queue.push(() => {
				active++;
				resolve();
			});
		});
	}

	function release(): void {
		active--;
		const next = queue.shift();
		if (next) next();
	}

	return {
		acquire,
		release,
		async run<T>(fn: () => Promise<T>): Promise<T> {
			await acquire();
			try {
				return await fn();
			} finally {
				release();
			}
		},
	};
}

/**
 * Wraps `Agent` so a slot is held for the whole streamed reply, not just
 * until `handleMessageStream` is *called* — calling it only constructs the
 * async generator, none of its body runs until iterated, so gating the call
 * itself would let unlimited streams start concurrently.
 */
export function withConcurrencyLimit(
	agent: Agent,
	limiter: ConcurrencyLimiter,
): Agent {
	return {
		handleMessageStream(
			message: IncomingMessage,
		): AsyncIterable<AgentStreamEvent> {
			return (async function* () {
				await limiter.acquire();
				try {
					yield* agent.handleMessageStream(message);
				} finally {
					limiter.release();
				}
			})();
		},
		resetThread: (threadId: string) => agent.resetThread(threadId),
	};
}

/** Wraps `DecisionAgent` — `decide()` is a plain `Promise`, so `run` fits directly. */
export function withDecisionConcurrencyLimit(
	agent: DecisionAgent,
	limiter: ConcurrencyLimiter,
): DecisionAgent {
	return {
		decide: (state, questions) =>
			limiter.run(() => agent.decide(state, questions)),
	};
}
