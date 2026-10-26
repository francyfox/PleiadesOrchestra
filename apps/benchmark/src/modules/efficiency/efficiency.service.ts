import { summarizeLatency } from "../stats/stats.service.ts";
import type {
	Cart,
	CaseRun,
	Contender,
	ContenderSummary,
	EfficiencyCase,
	Price,
	PriceOf,
} from "./efficiency.types.ts";

/** Right when the cart is exactly the expected one and the reply says what was asked. */
export function judge(
	test: EfficiencyCase,
	cart: Cart,
	reply: string,
): boolean {
	const want = Object.entries(test.expected);
	const sameCart =
		want.length === Object.keys(cart).length &&
		want.every(([name, quantity]) => cart[name] === quantity);
	return (
		sameCart && (!test.replyIncludes || reply.includes(test.replyIncludes))
	);
}

export const costUsd = (input: number, output: number, price: Price) =>
	(input * price.input + output * price.output) / 1_000_000;

const MODELS_URL = "https://openrouter.ai/api/v1/models";

/**
 * OpenRouter's public price list, per 1M tokens (it lists USD per token as
 * strings). The orchestrator's models here are OpenRouter's; a failed fetch is
 * an empty list, every model then costs the fallback.
 */
export async function loadPrices(
	fetchFn: (url: string) => Promise<Response> = fetch,
): Promise<Map<string, Price>> {
	const prices = new Map<string, Price>();
	try {
		const response = await fetchFn(MODELS_URL);
		if (!response.ok) return prices;
		const { data } = (await response.json()) as {
			data: {
				id: string;
				pricing?: { prompt?: string; completion?: string };
			}[];
		};
		for (const model of data) {
			const input = Number(model.pricing?.prompt) * 1_000_000;
			const output = Number(model.pricing?.completion) * 1_000_000;
			// Router entries carry -1 (the price depends on the routed model).
			if (input >= 0 && output >= 0) prices.set(model.id, { input, output });
		}
	} catch {}
	return prices;
}

/** A model's price; a response id with a version suffix (`…-001`) finds its listed id. */
export function priceOf(prices: Map<string, Price>, fallback: Price): PriceOf {
	return (model) => {
		if (!model) return fallback;
		const exact = prices.get(model);
		if (exact) return exact;
		let best: [string, Price] | undefined;
		for (const entry of prices)
			if (
				model.startsWith(entry[0]) &&
				entry[0].length > (best?.[0].length ?? 0)
			)
				best = entry;
		return best?.[1] ?? fallback;
	};
}

const mean = (values: number[]) =>
	values.length
		? values.reduce((sum, value) => sum + value, 0) / values.length
		: 0;

export function summarizeContender(
	contender: Pick<Contender, "name" | "tokensNote">,
	runs: CaseRun[],
): ContenderSummary {
	const latency = summarizeLatency(runs.map((run) => run.latencyMs));
	const inputTokens = runs.reduce((sum, run) => sum + run.inputTokens, 0);
	const outputTokens = runs.reduce((sum, run) => sum + run.outputTokens, 0);
	return {
		name: contender.name,
		tokensNote: contender.tokensNote,
		cases: runs.length,
		success: runs.length
			? runs.filter((run) => run.ok).length / runs.length
			: 0,
		p50Ms: latency.p50,
		meanMs: latency.mean,
		meanSteps: mean(runs.map((run) => run.modelCalls + run.toolCalls)),
		meanModelCalls: mean(runs.map((run) => run.modelCalls)),
		meanToolCalls: mean(runs.map((run) => run.toolCalls)),
		inputTokens,
		outputTokens,
		costUsd: runs.reduce((sum, run) => sum + run.costUsd, 0),
		runs,
	};
}
