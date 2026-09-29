import { describe, expect, test } from "bun:test";
import { createRunLock } from "./run-lock.ts";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe("createRunLock", () => {
	test("serializes calls sharing the same key", async () => {
		const lock = createRunLock();
		const order: string[] = [];
		const first = deferred<void>();

		const a = lock.withLock("thread-1", async () => {
			order.push("a-start");
			await first.promise;
			order.push("a-end");
		});
		// Give `a` a tick to actually start before queuing `b`.
		await Promise.resolve();
		const b = lock.withLock("thread-1", async () => {
			order.push("b-start");
		});

		// `b` must not have started yet — `a` still holds the lock.
		await Promise.resolve();
		expect(order).toEqual(["a-start"]);

		first.resolve();
		await Promise.all([a, b]);
		expect(order).toEqual(["a-start", "a-end", "b-start"]);
	});

	test("does not serialize calls with different keys", async () => {
		const lock = createRunLock();
		const order: string[] = [];
		const first = deferred<void>();

		const a = lock.withLock("thread-1", async () => {
			order.push("a-start");
			await first.promise;
			order.push("a-end");
		});
		await Promise.resolve();
		const b = lock.withLock("thread-2", async () => {
			order.push("b-start");
		});

		await b;
		// `b` (different key) ran to completion while `a` was still waiting.
		expect(order).toEqual(["a-start", "b-start"]);

		first.resolve();
		await a;
		expect(order).toEqual(["a-start", "b-start", "a-end"]);
	});

	test("a rejected call releases the key for the next queued call", async () => {
		const lock = createRunLock();
		const order: string[] = [];

		const a = lock.withLock("thread-1", async () => {
			order.push("a");
			throw new Error("boom");
		});
		const b = lock.withLock("thread-1", async () => {
			order.push("b");
		});

		await expect(a).rejects.toThrow("boom");
		await b;
		expect(order).toEqual(["a", "b"]);
	});

	test("returns the wrapped function's resolved value", async () => {
		const lock = createRunLock();
		const result = await lock.withLock("thread-1", async () => 42);
		expect(result).toBe(42);
	});
});
