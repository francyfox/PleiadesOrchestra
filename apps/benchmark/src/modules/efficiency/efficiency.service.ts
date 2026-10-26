import { summarizeLatency } from "../stats/stats.service.ts";
import type { MockShop } from "./efficiency.shop.ts";
import type {
	Cart,
	CaseRun,
	Contender,
	ContenderSummary,
	EfficiencyCase,
	Price,
	PriceOf,
} from "./efficiency.types.ts";

/**
 * Judged on what happened in the shop, never on the reply's words: the cart is
 * exactly the expected one, and a question about a product made the site show
 * it (`lookedUp`).
 */
export function judge(
	test: EfficiencyCase,
	shop: { cart: Cart; shown: string[] },
): boolean {
	const want = Object.entries(test.expected);
	const sameCart =
		want.length === Object.keys(shop.cart).length &&
		want.every(([name, quantity]) => shop.cart[name] === quantity);
	return sameCart && (!test.lookedUp || shop.shown.includes(test.lookedUp));
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

/**
 * `iterations` is the planned number of passes; the passes done follow from
 * the runs, so a partial run averages over what it has. Infrastructure errors
 * count as `errors`, not as failures: they stay out of the success share and
 * the means (their tokens and cost are still added up).
 */
export function summarizeContender(
	contender: Pick<Contender, "name" | "tokensNote">,
	runs: CaseRun[],
	iterations: number,
): ContenderSummary {
	const all = runs;
	runs = all.filter((run) => run.status !== "error");
	const latency = summarizeLatency(runs.map((run) => run.latencyMs));
	const inputTokens = all.reduce((sum, run) => sum + run.inputTokens, 0);
	const outputTokens = all.reduce((sum, run) => sum + run.outputTokens, 0);
	return {
		name: contender.name,
		tokensNote: contender.tokensNote,
		cases: all.length,
		iterations,
		done: all.length / (new Set(all.map((run) => run.id)).size || 1),
		errors: all.length - runs.length,
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
		costUsd: all.reduce((sum, run) => sum + run.costUsd, 0),
		runs: all,
	};
}

export interface CaseResult {
	/** Position in the plan: iteration, then case order. */
	order: number;
	iteration: number;
	test: EfficiencyCase;
	run: CaseRun;
	shop: MockShop;
}

/**
 * One contender over `iterations` passes of the cases, up to `concurrency` case
 * runs at once (each on its own fresh shop). `onResult` fires as each one
 * finishes, with every run so far in plan order, whatever order they end in.
 * `stopAfterErrors` infrastructure errors in a row end the run early.
 */
export async function runContender(deps: {
	contender: Contender;
	cases: EfficiencyCase[];
	iterations: number;
	concurrency: number;
	newShop: (test: EfficiencyCase) => MockShop;
	onResult?: (result: CaseResult, runs: CaseRun[]) => void;
	stopAfterErrors?: number;
}): Promise<{ runs: CaseRun[]; stopped: boolean }> {
	const { cases, contender } = deps;
	const total = cases.length * deps.iterations;
	const results: (CaseRun | undefined)[] = [];
	const sorted = () => results.filter((run): run is CaseRun => !!run);
	let next = 0;
	let errorsInRow = 0;
	let stopped = false;

	async function worker() {
		while (!stopped && next < total) {
			const order = next++;
			const test = cases[order % cases.length] as EfficiencyCase;
			const shop = deps.newShop(test);
			const run = await contender.run(shop, test);
			const done: CaseRun = {
				...run,
				ok:
					run.status !== "error" &&
					!run.error &&
					judge(test, { cart: shop.cart(), shown: shop.shown() }),
			};
			results[order] = done;
			errorsInRow = done.status === "error" ? errorsInRow + 1 : 0;
			if (errorsInRow >= (deps.stopAfterErrors ?? 5)) stopped = true;
			deps.onResult?.(
				{
					order,
					iteration: Math.floor(order / cases.length) + 1,
					test,
					run: done,
					shop,
				},
				sorted(),
			);
		}
	}
	await Promise.all(
		Array.from({ length: Math.max(1, deps.concurrency) }, worker),
	);
	return { runs: sorted(), stopped };
}
