import type { InfraCategory } from "./efficiency.infra.ts";
import type { MockShop } from "./efficiency.shop.ts";

/** Product name → quantity. */
export type Cart = Record<string, number>;

/** One visitor message against the mock shop, judged by the state it leaves. */
export interface EfficiencyCase {
	id: string;
	text: string;
	/** The language of `text` (the widget's `lang`). */
	lang: "en" | "ru";
	/** The cart before the message. */
	start: Cart;
	expected: Cart;
	/** A question, not a cart change: the site must have shown this product. */
	lookedUp?: string;
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
	/** "error": the infrastructure failed (see `errorCategory`), the case says nothing about the contender; `ok` is false then. */
	status?: "error";
	errorCategory?: InfraCategory;
	error?: string;
	/** The model the contender named in its responses (beta alone). */
	model?: string;
	/** Raw per-case detail for the traces file (beta: its steps; orchestra: the admin request). */
	detail?: unknown;
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
	/** Case runs: cases × iterations. */
	cases: number;
	/** Passes over all the cases planned. */
	iterations: number;
	/** Passes done so far (a fraction while one is running). */
	done: number;
	/** Case runs that ended in an infrastructure error. */
	errors: number;
	/** Of the case runs without an infrastructure error. */
	success: number;
	p50Ms: number;
	meanMs: number;
	/** Model calls + tool calls per case. */
	meanSteps: number;
	meanModelCalls: number;
	meanToolCalls: number;
	/** Totals over all iterations. */
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	runs: CaseRun[];
}
