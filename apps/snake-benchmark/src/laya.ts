import { Laya } from "@receptron/laya";
import type { DecideFn } from "./policy.ts";

export interface LoadedLaya {
	decide: DecideFn;
	close(): Promise<void>;
	loadMs: number;
}

/**
 * Loads Laya **in this process** — no HTTP/stdio hop, so the numbers are
 * pure inference (the HTTP path through `apps/gamma-decision` is measured
 * separately). Weights come from the same `~/.cache/receptron-laya` cache
 * gamma-decision uses on the host. `threads = 0` keeps onnxruntime's default.
 */
export async function loadLaya(options: {
	repo: string;
	modelDir?: string;
	threads: number;
}): Promise<LoadedLaya> {
	const started = performance.now();
	const laya = await Laya.load({
		repo: options.repo,
		modelDir: options.modelDir,
		sessionOptions:
			options.threads > 0
				? { intraOpNumThreads: options.threads, interOpNumThreads: 1 }
				: undefined,
	});
	return {
		loadMs: performance.now() - started,
		async decide(state, questions) {
			const result = await laya.systemOne(state, questions);
			return result.answers;
		},
		close: () => laya.close(),
	};
}
