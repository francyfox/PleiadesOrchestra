import { Laya } from "@receptron/laya";
import {
	createDecisionAgent,
	createTelemetry,
	type DecisionAgent,
} from "@repo/core";
import { createLayaModel } from "./laya.model.ts";
import type { LayaEngine, LoadedLaya } from "./laya.types.ts";

// One way to ask Laya, whoever answers: `createDecisionAgent` (the port
// production uses, over the AI SDK's `experimental_decide`) with either the
// server model (gamma-decision's `POST /v1/systemone`) or `createLayaModel`
// over weights loaded in this process.

/** Silent: the benchmark prints its own numbers, not production's JSON log lines. */
const telemetry = createTelemetry([]);

const timed = (
	agent: DecisionAgent,
	loadMs: number,
	close: () => Promise<void>,
): LoadedLaya => ({
	decide: (state, questions) => agent.decide(state, questions),
	async ask(request, questions) {
		const at = performance.now();
		const answers = await agent.decide({ message: request }, questions);
		return { answers, latencyMs: performance.now() - at };
	},
	loadMs,
	close,
});

/**
 * Laya behind HTTP (`LAYA_BASE_URL`): gamma-decision, or the same API on a GPU
 * box. The time is the round trip, as production pays it.
 */
export function createServerLaya(server: {
	baseUrl: string;
	apiKey?: string;
}): LoadedLaya {
	const agent = createDecisionAgent({
		baseURL: server.baseUrl,
		apiKey: server.apiKey ?? "",
		telemetry,
	});
	return timed(agent, 0, async () => {});
}

/** Laya in this process, no HTTP hop: the time is inference only. */
export function createLocalLaya(deps: {
	laya: LayaEngine;
	loadMs: number;
}): LoadedLaya {
	const model = createLayaModel({ laya: deps.laya });
	// `baseURL` and `apiKey` belong to the server model; this one has neither.
	const agent = createDecisionAgent({
		baseURL: "",
		apiKey: "",
		model,
		telemetry,
	});
	return timed(agent, deps.loadMs, () => model.close());
}

/**
 * The server's Laya when `baseUrl` is set, otherwise the weights loaded here
 * (the same `~/.cache/receptron-laya` gamma-decision uses on the host).
 * `threads` are onnxruntime's intra-op threads, 0 = its default.
 */
export async function loadLaya(options: {
	/** A Laya server's root (`LAYA_BASE_URL`); unset: load the weights here. */
	baseUrl?: string;
	apiKey?: string;
	repo: string;
	modelDir?: string;
	threads: number;
}): Promise<LoadedLaya> {
	if (options.baseUrl)
		return createServerLaya({
			baseUrl: options.baseUrl,
			apiKey: options.apiKey,
		});
	const started = performance.now();
	const laya = await Laya.load({
		repo: options.repo,
		modelDir: options.modelDir,
		sessionOptions:
			options.threads > 0
				? { intraOpNumThreads: options.threads, interOpNumThreads: 1 }
				: undefined,
	});
	return createLocalLaya({ laya, loadMs: performance.now() - started });
}
