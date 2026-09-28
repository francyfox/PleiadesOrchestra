import { describe, expect, test } from "bun:test";
import { retryFetch } from "./retry.ts";

function scripted(...steps: (Response | Error)[]) {
	const calls: { url: string; method: string }[] = [];
	const fetchFn = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		calls.push({ url: String(input), method: init?.method ?? "GET" });
		const step = steps[Math.min(calls.length, steps.length) - 1];
		if (step instanceof Error) throw step;
		return step?.clone() ?? new Response("empty");
	}) as typeof fetch;
	return { fetchFn, calls };
}

const noSleep = { sleep: async () => {}, random: () => 1 };

describe("retryFetch", () => {
	test("retries an idempotent request on 503 until it succeeds", async () => {
		const { fetchFn, calls } = scripted(
			new Response("busy", { status: 503 }),
			new Response("ok"),
		);
		const response = await retryFetch(fetchFn, noSleep)("http://localhost/a");
		expect(await response.text()).toBe("ok");
		expect(calls).toHaveLength(2);
	});

	test("does not retry a POST — it may have been processed already", async () => {
		const { fetchFn, calls } = scripted(new Response("busy", { status: 503 }));
		const response = await retryFetch(fetchFn, noSleep)("http://localhost/a", {
			method: "POST",
		});
		expect(response.status).toBe(503);
		expect(calls).toHaveLength(1);
	});

	test("does not retry client errors", async () => {
		const { fetchFn, calls } = scripted(new Response("no", { status: 404 }));
		const response = await retryFetch(fetchFn, noSleep)("http://localhost/a");
		expect(response.status).toBe(404);
		expect(calls).toHaveLength(1);
	});

	test("rethrows the network error once the attempts are used up", async () => {
		const { fetchFn, calls } = scripted(new Error("ECONNREFUSED"));
		await expect(
			retryFetch(fetchFn, { ...noSleep, retries: 2 })("http://localhost/a"),
		).rejects.toThrow("ECONNREFUSED");
		expect(calls).toHaveLength(3);
	});

	test("returns the last retryable response when attempts run out", async () => {
		const { fetchFn, calls } = scripted(new Response("busy", { status: 502 }));
		const response = await retryFetch(fetchFn, { ...noSleep, retries: 1 })(
			"http://localhost/a",
		);
		expect(response.status).toBe(502);
		expect(calls).toHaveLength(2);
	});

	test("waits Retry-After (capped) instead of the backoff", async () => {
		const waits: number[] = [];
		const { fetchFn } = scripted(
			new Response("slow down", {
				status: 429,
				headers: { "retry-after": "1" },
			}),
			new Response("ok"),
		);
		await retryFetch(fetchFn, {
			sleep: async (ms) => {
				waits.push(ms);
			},
			maxDelayMs: 5000,
		})("http://localhost/a");
		expect(waits).toEqual([1000]);
	});

	test("backs off exponentially with jitter", async () => {
		const waits: number[] = [];
		const { fetchFn } = scripted(new Response("busy", { status: 503 }));
		await retryFetch(fetchFn, {
			retries: 3,
			baseDelayMs: 100,
			maxDelayMs: 10_000,
			random: () => 1,
			sleep: async (ms) => {
				waits.push(ms);
			},
		})("http://localhost/a");
		expect(waits).toEqual([100, 200, 400]);
	});

	test("stops retrying once the caller aborted", async () => {
		const controller = new AbortController();
		const { fetchFn, calls } = scripted(new Response("busy", { status: 503 }));
		controller.abort();
		const response = await retryFetch(fetchFn, noSleep)("http://localhost/a", {
			signal: controller.signal,
		});
		expect(response.status).toBe(503);
		expect(calls).toHaveLength(1);
	});
});
