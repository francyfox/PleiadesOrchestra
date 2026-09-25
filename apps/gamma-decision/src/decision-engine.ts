import { Laya } from "@receptron/laya";
import type { config as Config } from "./env.ts";

export interface DecisionEngine {
	decide(
		state: unknown,
		questions: Record<string, unknown>,
	): Promise<Record<string, unknown>>;
	close(): Promise<void>;
}

/**
 * Loads the Laya ONNX bundle (downloaded from `LAYA_MODEL_REPO` on first use,
 * cached under `~/.cache/receptron-laya` afterwards) and wraps `systemOne`,
 * which follows TypeSafe Jev's `system_one` request/response shape — a map
 * of typed questions in, a map of typed answers out, no text generation.
 * Isolated in its own file so `server.ts` stays testable without the real
 * (~1.7GB) weights, by injecting a fake `decide` instead.
 */
/**
 * onnxruntime threading for Laya. Measured with apps/snake-benchmark on the
 * target Ryzen 5 5600H (results/threads-sweep-2026-09-24.json): 6 threads =
 * physical cores gave p50 382 ms vs 619 ms for onnxruntime's default, which
 * also oversubscribes SMT siblings (12 threads: p50 564 ms, p99 975 ms).
 * `0` keeps onnxruntime's default.
 */
export function sessionOptionsFor(threads: number) {
	if (threads <= 0) return undefined;
	return { intraOpNumThreads: threads, interOpNumThreads: 1 };
}

export async function loadDecisionEngine(
	config: typeof Config,
): Promise<DecisionEngine> {
	const laya = await Laya.load({
		repo: config.LAYA_MODEL_REPO,
		subfolder: config.LAYA_MODEL_SUBFOLDER,
		sessionOptions: sessionOptionsFor(config.LAYA_THREADS),
	});

	return {
		async decide(state, questions) {
			// biome-ignore lint/suspicious/noExplicitAny: systemOne's generic Record<string, Question> input isn't expressible from an already-validated-as-unknown request body.
			const result = await laya.systemOne(state, questions as any);
			return result.answers;
		},
		close() {
			return laya.close();
		},
	};
}
