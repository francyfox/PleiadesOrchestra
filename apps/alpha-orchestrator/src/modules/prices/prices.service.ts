import { DAY_MS, MINUTE_MS } from "../http/http.service.ts";

/** USD per token. */
export interface Price {
	input: number;
	output: number;
}
export type Prices = Map<string, Price>;

export interface PriceBookDeps {
	fetch?: (url: string) => Promise<Response>;
	now?: () => number;
}

const MODELS_URL = "https://openrouter.ai/api/v1/models";

/** Reads OpenRouter's public model list (`pricing.prompt`/`completion` are per-token strings). */
async function loadPrices(fetchFn: NonNullable<PriceBookDeps["fetch"]>) {
	const response = await fetchFn(MODELS_URL);
	if (!response.ok) throw new Error(`OpenRouter models: ${response.status}`);
	const body = (await response.json()) as {
		data: Array<{
			id: string;
			pricing?: { prompt?: string; completion?: string };
		}>;
	};
	const prices: Prices = new Map();
	for (const model of body.data) {
		const input = Number(model.pricing?.prompt);
		const output = Number(model.pricing?.completion);
		// Router entries carry -1 (price depends on the routed model); skip them.
		if (input >= 0 && output >= 0) prices.set(model.id, { input, output });
	}
	return prices;
}

/**
 * Model prices, refreshed once a day. A failed refresh keeps the previous
 * prices (or none) and is retried after a few minutes; `get` never throws.
 */
export function createPriceBook({
	fetch: fetchFn = (url) => fetch(url),
	now = Date.now,
}: PriceBookDeps = {}) {
	let prices: Prices | null = null;
	let retryAt = 0;
	return {
		async get(): Promise<Prices | null> {
			if (now() < retryAt) return prices;
			try {
				prices = await loadPrices(fetchFn);
				retryAt = now() + DAY_MS;
			} catch {
				retryAt = now() + 5 * MINUTE_MS;
			}
			return prices;
		},
	};
}

export type PriceBook = ReturnType<typeof createPriceBook>;

/** A model without a price is local (or unknown to OpenRouter): free. */
export function costUsd(
	inputTokens: number,
	outputTokens: number,
	price: Price | undefined,
): number {
	return price ? inputTokens * price.input + outputTokens * price.output : 0;
}
