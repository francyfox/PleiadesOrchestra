import { eq } from "drizzle-orm";
import { localModelPrices } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { DAY_MS, MINUTE_MS } from "../http/http.service.ts";

/** USD per token. `cacheRead` absent = cached input tokens cost the normal input price. */
export interface Price {
	input: number;
	output: number;
	cacheRead?: number;
}
export type Prices = Map<string, Price>;

export interface PriceBookDeps {
	fetch?: (url: string) => Promise<Response>;
	now?: () => number;
	/** Staff prices of local models; an explicit entry here wins over OpenRouter's for the same model id. */
	local?: () => Prices;
}

const MODELS_URL = "https://openrouter.ai/api/v1/models";

/** Reads OpenRouter's public model list (`pricing.prompt`/`completion`/`input_cache_read` are per-token strings). */
async function loadPrices(fetchFn: NonNullable<PriceBookDeps["fetch"]>) {
	const response = await fetchFn(MODELS_URL);
	if (!response.ok) throw new Error(`OpenRouter models: ${response.status}`);
	const body = (await response.json()) as {
		data: Array<{
			id: string;
			pricing?: {
				prompt?: string;
				completion?: string;
				input_cache_read?: string;
			};
		}>;
	};
	const prices: Prices = new Map();
	for (const model of body.data) {
		const input = Number(model.pricing?.prompt);
		const output = Number(model.pricing?.completion);
		// Router entries carry -1 (price depends on the routed model); skip them.
		if (input >= 0 && output >= 0) {
			const cacheRead = Number(model.pricing?.input_cache_read);
			prices.set(model.id, {
				input,
				output,
				// Absent field = Number(undefined) = NaN: cached tokens fall back to the input price.
				...(cacheRead >= 0 ? { cacheRead } : {}),
			});
		}
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
	local = () => new Map(),
}: PriceBookDeps = {}) {
	let prices: Prices | null = null;
	let retryAt = 0;
	// Without OpenRouter's list the prices stay unknown (null), local ones included.
	const merged = () => (prices ? new Map([...prices, ...local()]) : null);
	return {
		/** Last fetched prices without fetching; `null` until the first fetch succeeded. */
		peek: (): Prices | null => merged(),
		async get(): Promise<Prices | null> {
			if (now() < retryAt) return merged();
			try {
				prices = await loadPrices(fetchFn);
				retryAt = now() + DAY_MS;
			} catch {
				retryAt = now() + 5 * MINUTE_MS;
			}
			return merged();
		},
	};
}

export type PriceBook = ReturnType<typeof createPriceBook>;

/**
 * A model without a price is local (or unknown to OpenRouter): free. Cached
 * input tokens are part of `inputTokens` and cost `price.cacheRead`; the rest
 * costs the input price.
 */
export function costUsd(
	inputTokens: number,
	outputTokens: number,
	price: Price | undefined,
	cacheReadTokens = 0,
): number {
	if (!price) return 0;
	const cached = Math.min(cacheReadTokens, inputTokens);
	return (
		(inputTokens - cached) * price.input +
		cached * (price.cacheRead ?? price.input) +
		outputTokens * price.output
	);
}

const PER_MILLION = 1_000_000;

/** Staff-set local prices as the per-token map the price book merges. */
export function readLocalPrices(db: Pick<Db, "select">): Prices {
	return new Map(
		db
			.select()
			.from(localModelPrices)
			.all()
			.map((row) => [
				row.model,
				{
					input: row.inputPerMillionUsd / PER_MILLION,
					output: row.outputPerMillionUsd / PER_MILLION,
					...(row.cacheReadPerMillionUsd === null
						? {}
						: { cacheRead: row.cacheReadPerMillionUsd / PER_MILLION }),
				},
			]),
	);
}

export const listLocalPrices = (db: Pick<Db, "select">) =>
	db.select().from(localModelPrices).all();

export function saveLocalPrice(
	db: Db,
	model: string,
	price: {
		inputPerMillionUsd: number;
		outputPerMillionUsd: number;
		cacheReadPerMillionUsd?: number;
	},
) {
	const values = { cacheReadPerMillionUsd: null, ...price };
	db.insert(localModelPrices)
		.values({ model, ...values })
		.onConflictDoUpdate({ target: localModelPrices.model, set: values })
		.run();
}

export const deleteLocalPrice = (db: Db, model: string) =>
	db.delete(localModelPrices).where(eq(localModelPrices.model, model)).run();
