import { createFunctionCallModel } from "@repo/core";
import { APICallError, generateText, jsonSchema, stepCountIs, tool } from "ai";
import { costUsd } from "./efficiency.service.ts";
import type { Contender, PriceOf } from "./efficiency.types.ts";

const SYSTEM =
	"You are a shop assistant. Use the tools to do what the visitor asks, then answer in one or two sentences.";

const textOf = (result: { content: { text?: string }[] }) =>
	result.content.map((block) => block.text ?? "").join("");

/**
 * The baseline: beta's model with the shop's tools as plain function calling,
 * the usual agent loop (the model picks a tool, reads its answer, again) up to
 * `maxSteps` model calls. No planner, no Laya, no delta. Asked through the
 * orchestrator's `POST /v1/chat/completions`, so it is the very model the
 * orchestrator replies with.
 */
export function createBetaContender(deps: {
	/** The orchestrator's root and its HARNESS_API_KEY. */
	baseUrl: string;
	apiKey: string;
	maxSteps: number;
	priceOf: PriceOf;
	fetch?: typeof fetch;
}): Contender {
	// An OpenAI-compatible chat model that sends include_usage; the server replaces `model`.
	const model = createFunctionCallModel({
		baseURL: `${deps.baseUrl}/v1`,
		apiKey: deps.apiKey,
		model: "beta-text",
		fetch: deps.fetch,
	});

	return {
		name: "beta alone",
		tokensNote: "every call of the model (usage of each step)",
		async run(shop, test) {
			const { tools: list } = await shop.listTools();
			const tools = Object.fromEntries(
				list.map((one) => [
					one.name,
					tool({
						description: one.description,
						inputSchema: jsonSchema<Record<string, unknown>>(
							one.inputSchema as Parameters<typeof jsonSchema>[0],
						),
						execute: async (args) =>
							textOf(await shop.callTool({ name: one.name, arguments: args })),
					}),
				]),
			);
			const started = performance.now();
			try {
				const result = await generateText({
					model,
					system: SYSTEM,
					prompt: test.text,
					tools,
					stopWhen: stepCountIs(deps.maxSteps),
					temperature: 0,
				});
				return {
					id: test.id,
					latencyMs: performance.now() - started,
					modelCalls: result.steps.length,
					toolCalls: result.steps.flatMap((step) => step.toolCalls).length,
					inputTokens: result.usage.inputTokens ?? 0,
					outputTokens: result.usage.outputTokens ?? 0,
					costUsd: result.steps.reduce(
						(sum, step) =>
							sum +
							costUsd(
								step.usage.inputTokens ?? 0,
								step.usage.outputTokens ?? 0,
								deps.priceOf(step.response.modelId),
							),
						0,
					),
					reply: result.text,
				};
			} catch (error) {
				return {
					id: test.id,
					latencyMs: performance.now() - started,
					modelCalls: 0,
					toolCalls: 0,
					inputTokens: 0,
					outputTokens: 0,
					costUsd: 0,
					reply: "",
					// "Not Found" alone hid that the orchestrator had no such route.
					error: APICallError.isInstance(error)
						? `HTTP ${error.statusCode} ${error.url}: ${error.message}`
						: error instanceof Error
							? error.message
							: String(error),
				};
			}
		},
	};
}
