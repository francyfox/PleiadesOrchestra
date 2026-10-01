import { Laya } from "@receptron/laya";
import type { Config } from "../config/config.ts";
import { sessionOptionsFor } from "./decision-engine.service.ts";

export interface DecisionEngine {
	decide(
		state: unknown,
		questions: Record<string, unknown>,
	): Promise<Record<string, unknown>>;
	close(): Promise<void>;
}

/**
 * Loads the Laya ONNX bundle (downloaded from `LAYA_MODEL_REPO` on first use,
 * cached under `~/.cache/receptron-laya` afterwards) and wraps `systemOne`:
 * a map of typed questions in, a map of typed answers out, no text generation.
 * Kept apart from the HTTP code so the app is testable with a fake `decide`,
 * without the real (~1.7GB) weights.
 */
export async function loadDecisionEngine(
	config: Config,
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
