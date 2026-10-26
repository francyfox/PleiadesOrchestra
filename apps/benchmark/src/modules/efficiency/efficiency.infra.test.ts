import { describe, expect, test } from "bun:test";
import {
	checkInfrastructure,
	createInfraFetch,
	InfraError,
} from "./efficiency.infra.ts";

const fast = { delaysMs: [1, 1, 1], timeoutMs: 1000 };

describe("createInfraFetch", () => {
	test("a transient error is retried, then the answer comes through", async () => {
		const statuses = [503, 429, 200];
		const http = createInfraFetch({
			...fast,
			fetch: (async () =>
				new Response("x", {
					status: statuses.shift(),
				})) as unknown as typeof fetch,
		});
		expect((await http("http://x/a")).status).toBe(200);
		expect(statuses).toEqual([]);
	});

	test("still failing after the retries: an InfraError with its category", async () => {
		let calls = 0;
		const http = createInfraFetch({
			...fast,
			fetch: (async () => {
				calls++;
				return new Response("down", { status: 502 });
			}) as unknown as typeof fetch,
		});
		const error = await http("http://x/a").catch((one) => one);
		expect(error).toBeInstanceOf(InfraError);
		expect(error.category).toBe("http");
		expect(calls).toBe(4);
	});

	test("an error body inside HTTP 200 and a 404 'no endpoints' are model-unavailable", async () => {
		const http = createInfraFetch({
			...fast,
			fetch: (async () =>
				Response.json({
					error: { message: "No endpoints found for x", code: 404 },
				})) as unknown as typeof fetch,
		});
		const error = await http("http://x/a").catch((one) => one);
		expect(error.category).toBe("model-unavailable");
	});

	test("a network error is retried and recorded as network", async () => {
		let calls = 0;
		const http = createInfraFetch({
			...fast,
			fetch: (async () => {
				calls++;
				throw new TypeError("fetch failed");
			}) as unknown as typeof fetch,
		});
		expect((await http("http://x/a").catch((one) => one)).category).toBe(
			"network",
		);
		expect(calls).toBe(4);
	});

	test("a hung call is cut by the timeout", async () => {
		const http = createInfraFetch({
			delaysMs: [],
			timeoutMs: 20,
			fetch: ((_url: string, init?: RequestInit) =>
				new Promise((_, reject) =>
					init?.signal?.addEventListener("abort", () =>
						reject(init.signal?.reason),
					),
				)) as unknown as typeof fetch,
		});
		expect((await http("http://x/a").catch((one) => one)).category).toBe(
			"timeout",
		);
	});

	test("retry429 off: a 429 goes to the caller", async () => {
		const http = createInfraFetch({
			...fast,
			retry429: false,
			fetch: (async () =>
				new Response("", { status: 429 })) as unknown as typeof fetch,
		});
		expect((await http("http://x/a")).status).toBe(429);
	});
});

describe("checkInfrastructure", () => {
	test("stops with a clear message when the orchestrator is down", async () => {
		await expect(
			checkInfrastructure({
				baseUrl: "http://x",
				apiKey: "k",
				delaysMs: [],
				fetch: (async () =>
					new Response("", { status: 503 })) as unknown as typeof fetch,
			}),
		).rejects.toThrow(/orchestrator.*not up/);
	});
});
