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
export async function loadDecisionEngine(
	config: typeof Config,
): Promise<DecisionEngine> {
	const laya = await Laya.load({
		repo: config.LAYA_MODEL_REPO,
		subfolder: config.LAYA_MODEL_SUBFOLDER,
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
