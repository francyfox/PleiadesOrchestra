import type { MockShop } from "./efficiency.shop.ts";

/** Product name → quantity. */
export type Cart = Record<string, number>;

/** One visitor message against the mock shop, judged by the cart it leaves. */
export interface EfficiencyCase {
	id: string;
	text: string;
	/** The cart before the message. */
	start: Cart;
	expected: Cart;
	/** The reply must say this too (an answer, not a cart change). */
	replyIncludes?: string;
}

/** What one contender did with one case. */
export interface CaseRun {
	id: string;
	ok: boolean;
	latencyMs: number;
	/** Model requests (any model of the contender). */
	modelCalls: number;
	toolCalls: number;
	inputTokens: number;
	outputTokens: number;
	/** Each call priced by its own model. */
	costUsd: number;
	reply: string;
	error?: string;
}

/** A way to serve the visitor: beta alone, or the orchestrator with beta. */
export interface Contender {
	name: string;
	/** What the token counts cover, for the report. */
	tokensNote: string;
	run(shop: MockShop, test: EfficiencyCase): Promise<Omit<CaseRun, "ok">>;
}

/** The price of a model's tokens; the fallback for a model without one. */
export type PriceOf = (model: string | undefined) => Price;

/** USD per 1M tokens. */
export interface Price {
	input: number;
	output: number;
}

export interface ContenderSummary {
	name: string;
	tokensNote: string;
	cases: number;
	success: number;
	p50Ms: number;
	meanMs: number;
	/** Model calls + tool calls per case. */
	meanSteps: number;
	meanModelCalls: number;
	meanToolCalls: number;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	runs: CaseRun[];
}
