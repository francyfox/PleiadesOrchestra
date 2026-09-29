import { describe, expect, test } from "bun:test";
import {
	createConcurrencyLimiter,
	withConcurrencyLimit,
	withDecisionConcurrencyLimit,
} from "./concurrency-limiter.ts";
import type { DecisionAgent } from "./decision-types.ts";
import type { Agent, AgentStreamEvent, IncomingMessage } from "./types.ts";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe("createConcurrencyLimiter", () => {
	test("runs up to the limit concurrently and queues the rest", async () => {
		const limiter = createConcurrencyLimiter(2);
		const started: string[] = [];
		const gates = {
			a: deferred<void>(),
			b: deferred<void>(),
			c: deferred<void>(),
		};

		const a = limiter.run(async () => {
			started.push("a");
			await gates.a.promise;
		});
		const b = limiter.run(async () => {
			started.push("b");
			await gates.b.promise;
		});
		const c = limiter.run(async () => {
			started.push("c");
			await gates.c.promise;
		});

		await Promise.resolve();
		await Promise.resolve();
		// Limit is 2 — `c` must still be queued behind `a`/`b`.
		expect(started).toEqual(["a", "b"]);

		gates.a.resolve();
		await a;
		await Promise.resolve();
		expect(started).toEqual(["a", "b", "c"]);

		gates.b.resolve();
		gates.c.resolve();
		await Promise.all([b, c]);
	});

	test("releases the slot when the wrapped function rejects", async () => {
		const limiter = createConcurrencyLimiter(1);

		await expect(
			limiter.run(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		// The failed call must have freed its slot — this would hang otherwise.
		const result = await limiter.run(async () => "ok");
		expect(result).toBe("ok");
	});

	test("returns the wrapped function's resolved value", async () => {
		const limiter = createConcurrencyLimiter(3);
		const result = await limiter.run(async () => 42);
		expect(result).toBe(42);
	});
});

function message(): IncomingMessage {
	return { threadId: "t1", userId: "u1", chunks: ["hi"] };
}

async function* events(): AsyncGenerator<AgentStreamEvent> {
	yield { type: "delta", text: "hi" };
	yield { type: "done", elapsedMs: 1 };
}

describe("withConcurrencyLimit", () => {
	test("holds the slot for the whole stream, not just until it's called", async () => {
		const limiter = createConcurrencyLimiter(1);
		const inner: Agent = {
			handleMessageStream: () => events(),
			resetThread: async () => {},
		};
		const limited = withConcurrencyLimit(inner, limiter);

		const stream = limited.handleMessageStream(message());
		// Calling handleMessageStream must not itself consume a slot forever —
		// only iterating the returned stream should. A second, unrelated
		// `limiter.run` must be free to go through concurrently right now.
		const other = await limiter.run(async () => "other ran");
		expect(other).toBe("other ran");

		const seen: AgentStreamEvent["type"][] = [];
		for await (const event of stream) seen.push(event.type);
		expect(seen).toEqual(["delta", "done"]);
	});

	test("releases the slot even when the stream throws", async () => {
		const limiter = createConcurrencyLimiter(1);
		const inner: Agent = {
			// A hand-rolled `AsyncIterable` (not a generator function) so it can
			// throw on the very first `next()` without an unreachable `yield`.
			handleMessageStream: () => ({
				[Symbol.asyncIterator]: () => ({
					next: (): Promise<IteratorResult<AgentStreamEvent>> =>
						Promise.reject(new Error("stream broke")),
				}),
			}),
			resetThread: async () => {},
		};
		const limited = withConcurrencyLimit(inner, limiter);

		await expect(async () => {
			for await (const _ of limited.handleMessageStream(message())) {
				// draining
			}
		}).toThrow("stream broke");

		const result = await limiter.run(async () => "ok");
		expect(result).toBe("ok");
	});

	test("passes resetThread straight through", async () => {
		const limiter = createConcurrencyLimiter(1);
		let resetCalledWith: string | undefined;
		const inner: Agent = {
			handleMessageStream: () => events(),
			resetThread: async (threadId) => {
				resetCalledWith = threadId;
			},
		};
		await withConcurrencyLimit(inner, limiter).resetThread("t1");
		expect(resetCalledWith).toBe("t1");
	});
});

describe("withDecisionConcurrencyLimit", () => {
	test("queues decide() calls beyond the limit", async () => {
		const limiter = createConcurrencyLimiter(1);
		const started: string[] = [];
		let releaseFirst!: () => void;
		const gate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const inner: DecisionAgent = {
			decide: async (_state, questions) => {
				const label = Object.keys(questions)[0] ?? "";
				started.push(label);
				if (label === "first") await gate;
				return {};
			},
		};
		const limited = withDecisionConcurrencyLimit(inner, limiter);

		const first = limited.decide(
			{},
			{ first: { type: "noul", instructions: "" } },
		);
		await Promise.resolve();
		const second = limited.decide(
			{},
			{ second: { type: "noul", instructions: "" } },
		);

		await Promise.resolve();
		expect(started).toEqual(["first"]);

		releaseFirst();
		await Promise.all([first, second]);
		expect(started).toEqual(["first", "second"]);
	});
});
