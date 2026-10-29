// Measured with `bun efficiency` (apps/benchmark, results/efficiency/*-2026-10-29), every model hosted
// through OpenRouter, each call at its model's OpenRouter price.

/** One step of a run: a model call has its time and price, a code step only its time, a site step neither. */
export type FlowStep = {
	id: string;
	model?: string;
	ms?: number;
	usd?: number;
};
export type FlowScenario = {
	/** Whether the run left the shop in the right state. */
	done: boolean;
	steps: FlowStep[];
	/** The decision's options at step `at`; the first one is what the model chose. */
	fan?: { at: string; options: string[] };
};
/** One contender over all the case runs: a model alone with the tools, or the orchestrator. */
export type FlowResult = {
	name: string;
	orchestra?: boolean;
	success: number;
	p50Ms: number;
	/** Unset where the orchestrator made no API call (local models): there is no bill to compare. */
	usdPerSuccess?: number;
};

export type FlowKey = "llm" | "orchestra";
export const FLOW_KEYS: FlowKey[] = ["llm", "orchestra"];
export type FlowCase = "remove-all" | "add-list" | "price";

// One run per task, the median time of its passes. Only LLM: gpt-6-luna alone (results/efficiency/
// providers-2026-10-29); the orchestrator: channel shop-test with the shop intent set (clean-shop-intents-2026-10-29: code
// steps timed to the microsecond; a tool step is the browser round trip, here the benchmark over HTTP).
// Prices per 1M tokens, input / output: gpt-6-luna $0.10 / $0.50, voxtral $0.10 / $0.30, llama-3.1-8b
// $0.05 / $0.08, the decision model (unlisted) $0.05 / $0.08. In `price` gamma picks from the shop set's
// twelve intents; the fan shows four.
export const FLOW_CASES: Record<FlowCase, Record<FlowKey, FlowScenario>> = {
	"remove-all": {
		llm: {
			done: true,
			steps: [
				{ id: "widget" },
				{ id: "llm1", model: "gpt-6-luna", ms: 1811, usd: 2.91e-5 },
				{ id: "llm2", model: "gpt-6-luna", ms: 1491, usd: 5.91e-5 },
				{ id: "llm3", model: "gpt-6-luna", ms: 2245, usd: 4.21e-5 },
				{ id: "answer" },
			],
		},
		orchestra: {
			done: true,
			steps: [
				{ id: "widget" },
				{
					id: "understand",
					model: "voxtral-small-24b",
					ms: 611,
					usd: 0.000147,
				},
				{ id: "rules", ms: 0.03 },
				{ id: "plan", ms: 0.138 },
				{ id: "tool1", ms: 3.46 },
				{ id: "tool2", ms: 2.461 },
				{ id: "tool3", ms: 2.215 },
				{ id: "template", ms: 0.654 },
				{ id: "answer" },
			],
		},
	},
	"add-list": {
		llm: {
			done: true,
			steps: [
				{ id: "widget" },
				{ id: "llm1", model: "gpt-6-luna", ms: 1788, usd: 5.83e-5 },
				{ id: "llm2", model: "gpt-6-luna", ms: 1796, usd: 8.02e-5 },
				{ id: "llm3", model: "gpt-6-luna", ms: 1692, usd: 7.59e-5 },
				{ id: "answer" },
			],
		},
		orchestra: {
			done: true,
			steps: [
				{ id: "widget" },
				{
					id: "understand",
					model: "voxtral-small-24b",
					ms: 1192,
					usd: 0.000169,
				},
				{ id: "rules" },
				{ id: "memory", ms: 0.194 },
				{ id: "plan", ms: 0.157 },
				{ id: "delta1", model: "llama-3.1-8b", ms: 435, usd: 3.04e-5 },
				{ id: "delta2", model: "llama-3.1-8b", ms: 611, usd: 3.25e-5 },
				{ id: "delta3", model: "llama-3.1-8b", ms: 467, usd: 3.04e-5 },
				{ id: "tool1", ms: 3.477 },
				{ id: "template", ms: 9.051 },
				{ id: "answer" },
			],
		},
	},
	price: {
		llm: {
			done: true,
			steps: [
				{ id: "widget" },
				{ id: "llm1", model: "gpt-6-luna", ms: 1331, usd: 3.29e-5 },
				{ id: "llm2", model: "gpt-6-luna", ms: 1698, usd: 3.99e-5 },
				{ id: "answer" },
			],
		},
		orchestra: {
			done: true,
			steps: [
				{ id: "widget" },
				{
					id: "understand",
					model: "voxtral-small-24b",
					ms: 889,
					usd: 0.000155,
				},
				{ id: "rules" },
				{ id: "gamma", model: "pplx-decider-v1.2", ms: 682, usd: 1.18e-5 },
				{ id: "plan", ms: 0.116 },
				{ id: "delta1", model: "llama-3.1-8b", ms: 401, usd: 3e-5 },
				{ id: "beta", model: "voxtral-small-24b", ms: 430, usd: 6.59e-5 },
				{ id: "answer" },
			],
			fan: {
				at: "gamma",
				options: ["search", "readState", "other", "addToCart"],
			},
		},
	},
};
export const FLOW_CASE_KEYS = Object.keys(FLOW_CASES) as FlowCase[];

// Every case 3 times (14 cases). The orchestrator rows were remeasured after the delta prompt's examples
// moved off the benchmark's domains. Folders: clean-shop-intents-, clean-no-intents-, landing- (voxtral
// alone), mistral-medium-, providers-2026-10-29.
export const FLOW_RESULTS = {
	date: "2026-10-29",
	contenders: [
		{
			name: "Orchestrator, shop set: voxtral-small-24b (alpha, beta) + llama-3.1-8b (delta) + pplx-decider-v1.2 (gamma)",
			orchestra: true,
			success: 1,
			p50Ms: 1840,
			usdPerSuccess: 0.000228,
		},
		{
			name: "Orchestrator, no set: voxtral-small-24b (alpha, beta) + llama-3.1-8b (delta) + pplx-decider-v1.2 (gamma)",
			orchestra: true,
			success: 1,
			p50Ms: 2170,
			usdPerSuccess: 0.000251,
		},
		// Every model local on one RTX 2060 (6 GB), which holds two models besides d3: the run end to end with
		// QVikhr-3-4B for alpha, beta and delta (clean-local-2026-10-29, 100%), then `bun replay --delta
		// arch-function-3b` asked its 60 delta calls again on Arch-Function: 60 of 60 same arguments, so the same
		// runs; time with every model call warm (no swap). No API calls, so no cost bar.
		{
			name: "Orchestrator, local: QVikhr-3-4B (alpha, beta) + Arch-Function-3B (delta) + d3-lite (gamma)",
			orchestra: true,
			success: 1,
			p50Ms: 1610,
		},
		{
			name: "voxtral-small-24b",
			success: 0.64,
			p50Ms: 1220,
			usdPerSuccess: 0.000129,
		},
		{
			name: "mistral-medium-3.1",
			success: 1,
			p50Ms: 1770,
			usdPerSuccess: 0.000607,
		},
		{ name: "gpt-6-luna", success: 1, p50Ms: 4400, usdPerSuccess: 0.000125 },
		{
			name: "deepseek-v4-flash",
			success: 1,
			p50Ms: 5790,
			usdPerSuccess: 0.000219,
		},
	] as FlowResult[],
	// Orchestrator rows name every model they ran: alpha and beta, delta, gamma (local: QVikhr does alpha, beta
	// and delta). The headline figures: `main` against the same model alone and the bigger model of its family.
	main: "Orchestrator, shop set: voxtral-small-24b (alpha, beta) + llama-3.1-8b (delta) + pplx-decider-v1.2 (gamma)",
	same: "voxtral-small-24b",
	bigger: "mistral-medium-3.1",
	// English only, like the whole benchmarks section.
	docs: "/docs/benchmarks/overview/",
};
