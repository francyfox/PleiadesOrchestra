import { createFunctionCallModel } from "@repo/core";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import {
	asInfra,
	createInfraFetch,
	type InfraOptions,
} from "./efficiency.infra.ts";
import { costUsd } from "./efficiency.service.ts";
import type { Contender, PriceOf } from "./efficiency.types.ts";

const SYSTEM =
	"You are a shop assistant. Use the tools to do what the visitor asks, then answer in one or two sentences, in the language of the visitor's message.";

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
	/** The orchestrator's root and its HARNESS_API_KEY, or OpenRouter's root and key with `model`. */
	baseUrl: string;
	apiKey: string;
	/** A hosted model asked directly (`--models`); unset: the orchestrator's beta-text. */
	model?: string;
	maxSteps: number;
	priceOf: PriceOf;
	fetch?: typeof fetch;
	/** Timeout and retry delays (tests). */
	infra?: InfraOptions;
}): Contender {
	// An OpenAI-compatible chat model that sends include_usage; the server replaces `model`.
	const model = createFunctionCallModel({
		baseURL: `${deps.baseUrl}/v1`,
		apiKey: deps.apiKey,
		model: deps.model ?? "beta-text",
		fetch: createInfraFetch({ ...deps.infra, fetch: deps.fetch }),
	});

	return {
		name: deps.model ?? "beta alone",
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
			// Wall time of each step (the model call plus its tools), for per-step timings.
			const stepMs: number[] = [];
			let stepStarted = started;
			try {
				const result = await generateText({
					model,
					system: SYSTEM,
					prompt: test.text,
					tools,
					stopWhen: stepCountIs(deps.maxSteps),
					temperature: 0,
					// createInfraFetch retries; the SDK would retry on top of it.
					maxRetries: 0,
					onStepFinish: () => {
						const now = performance.now();
						stepMs.push(now - stepStarted);
						stepStarted = now;
					},
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
					model: result.steps.at(-1)?.response.modelId,
					detail: result.steps.map((step, i) => ({
						modelId: step.response.modelId,
						ms: stepMs[i],
						usage: step.usage,
						toolCalls: step.toolCalls,
						toolResults: step.toolResults,
					})),
				};
			} catch (error) {
				const infra = asInfra(error);
				return {
					id: test.id,
					latencyMs: performance.now() - started,
					modelCalls: 0,
					toolCalls: 0,
					inputTokens: 0,
					outputTokens: 0,
					costUsd: 0,
					reply: "",
					...(infra && {
						status: "error" as const,
						errorCategory: infra.category,
					}),
					error:
						(infra ?? error) instanceof Error
							? ((infra ?? error) as Error).message
							: String(error),
				};
			}
		},
	};
}
