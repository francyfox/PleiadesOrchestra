import { describe, expect, test } from "bun:test";
import { createOrchestraContender } from "./efficiency.orchestra.ts";
import { createMockShop } from "./efficiency.shop.ts";

const ndjson = (...lines: unknown[]) =>
	new Response(lines.map((line) => JSON.stringify(line)).join("\n"));

describe("createOrchestraContender", () => {
	test("plays the browser: runs each tool_call on the shop and posts the result back", async () => {
		const shop = createMockShop(3);
		const product = shop.catalog.find((one) => one.inStock);
		if (!product) throw new Error("no product");
		const posted: { path: string; body: Record<string, unknown> }[] = [];

		const fakeFetch = (async (url: string, init?: RequestInit) => {
			const path = new URL(url).pathname;
			const body = init?.body ? JSON.parse(String(init.body)) : {};
			posted.push({ path, body });
			if (path === "/v1/widget/visitors")
				return Response.json(
					{ visitorToken: "v", expiresAt: 0 },
					{ status: 201 },
				);
			if (path === "/v1/widget/threads")
				return Response.json(
					{ threadId: `t${posted.length}` },
					{ status: 201 },
				);
			if (path === "/v1/widget/tools")
				return new Response(null, { status: 204 });
			if (path === "/v1/widget/messages" && body.text === "hi")
				return ndjson({ type: "done", elapsedMs: 1 });
			if (path === "/v1/widget/messages")
				return ndjson(
					{ type: "step", id: "add_to_cart", phase: "running", text: "…" },
					{
						type: "tool_call",
						tool: "add_to_cart",
						callId: "c1",
						arguments: { items: [{ product: product.name, quantity: 1 }] },
					},
				);
			if (path === "/v1/widget/tool-results")
				return ndjson(
					{ type: "delta", text: "Added " },
					{ type: "delta", text: "it." },
					{
						type: "done",
						elapsedMs: 5,
						totalInputTokens: 40,
						totalOutputTokens: 7,
					},
				);
			return new Response(null, { status: 404 });
		}) as typeof fetch;

		const contender = createOrchestraContender({
			baseUrl: "http://localhost:3000",
			publishableKey: "pk",
			origin: "http://shop.test",
			priceOf: () => ({ input: 1, output: 1 }),
			fetch: fakeFetch,
		});
		const run = await contender.run(shop, {
			id: "add-one",
			text: `Add ${product.name} to my cart.`,
			lang: "en",
			start: {},
			expected: {},
		});

		expect(shop.cart()).toEqual({ [product.name]: 1 });
		expect(run).toMatchObject({
			toolCalls: 1,
			modelCalls: 1,
			inputTokens: 40,
			outputTokens: 7,
			reply: "Added it.",
		});
		const result = posted.find((one) => one.path === "/v1/widget/tool-results");
		expect(result?.body).toMatchObject({ callId: "c1", tool: "add_to_cart" });
		expect(JSON.stringify(result?.body.result)).toContain("Added: 1 ×");
	});

	test("a 429 is waited out and retried, the wait not counted as latency", async () => {
		const shop = createMockShop(3);
		let toolsCalls = 0;
		const contender = createOrchestraContender({
			baseUrl: "http://localhost:3000",
			publishableKey: "pk",
			origin: "http://shop.test",
			priceOf: () => ({ input: 0, output: 0 }),
			rateLimitWaitMs: 1,
			fetch: (async (url: string) => {
				const path = new URL(url).pathname;
				if (path === "/v1/widget/visitors")
					return Response.json({ visitorToken: "v" }, { status: 201 });
				if (path === "/v1/widget/threads")
					return Response.json({ threadId: "t" }, { status: 201 });
				if (path === "/v1/widget/tools")
					return new Response(null, { status: ++toolsCalls === 2 ? 429 : 204 });
				return ndjson({ type: "delta", text: "ok" }, { type: "done" });
			}) as typeof fetch,
		});
		const run = await contender.run(shop, {
			id: "x",
			text: "hello",
			lang: "en",
			start: {},
			expected: {},
		});
		expect(run.error).toBeUndefined();
		expect(run.reply).toBe("ok");
		expect(toolsCalls).toBe(3);
	});

	test("an orchestrator that is down is an error of the infrastructure after the retries", async () => {
		let calls = 0;
		const contender = createOrchestraContender({
			baseUrl: "http://localhost:3000",
			publishableKey: "pk",
			origin: "http://shop.test",
			priceOf: () => ({ input: 0, output: 0 }),
			infra: { delaysMs: [1, 1], timeoutMs: 1000 },
			fetch: (async () => {
				calls++;
				throw new TypeError("fetch failed");
			}) as unknown as typeof fetch,
		});
		const run = await contender.run(createMockShop(3), {
			id: "x",
			text: "hello",
			lang: "en",
			start: {},
			expected: {},
		});
		expect(calls).toBe(3);
		expect(run).toMatchObject({ status: "error", errorCategory: "network" });
	});
});
