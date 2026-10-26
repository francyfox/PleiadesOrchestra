import { describe, expect, test } from "bun:test";
import { createBetaContender } from "./efficiency.beta.ts";
import { createMockShop } from "./efficiency.shop.ts";

const completion = (message: Record<string, unknown>, finish: string) =>
	Response.json({
		id: "x",
		object: "chat.completion",
		created: 0,
		model: "google/gemini-2.5-flash-lite-001",
		choices: [{ index: 0, message, finish_reason: finish }],
		usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
	});

describe("createBetaContender", () => {
	test("a tool loop through the orchestrator's /v1/chat/completions, each call priced by its model", async () => {
		const shop = createMockShop(5);
		const product = shop.catalog.find((one) => one.inStock);
		if (!product) throw new Error("no product");
		const urls: string[] = [];
		let call = 0;
		const contender = createBetaContender({
			baseUrl: "http://localhost:3000",
			apiKey: "harness",
			maxSteps: 4,
			priceOf: (model) =>
				model?.startsWith("google/gemini-2.5-flash-lite")
					? { input: 1, output: 10 }
					: { input: 0, output: 0 },
			fetch: (async (url: string) => {
				urls.push(url);
				call++;
				if (call === 1)
					return completion(
						{
							role: "assistant",
							content: null,
							tool_calls: [
								{
									id: "t1",
									type: "function",
									function: {
										name: "add_to_cart",
										arguments: JSON.stringify({
											items: [{ product: product.name, quantity: 2 }],
										}),
									},
								},
							],
						},
						"tool_calls",
					);
				return completion({ role: "assistant", content: "Done." }, "stop");
			}) as typeof fetch,
		});

		const run = await contender.run(shop, {
			id: "add",
			text: `Add 2 ${product.name}`,
			start: {},
			expected: {},
		});

		expect(urls).toEqual([
			"http://localhost:3000/v1/chat/completions",
			"http://localhost:3000/v1/chat/completions",
		]);
		expect(shop.cart()).toEqual({ [product.name]: 2 });
		expect(run).toMatchObject({
			modelCalls: 2,
			toolCalls: 1,
			inputTokens: 2000,
			outputTokens: 200,
			reply: "Done.",
		});
		// 2 × (1000 in × $1 + 100 out × $10) per 1M
		expect(run.costUsd).toBeCloseTo(0.004);
	});
});
