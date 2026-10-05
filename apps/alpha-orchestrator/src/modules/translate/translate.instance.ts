import { config } from "../config/config.service.ts";
import { createTranslator, type Translate } from "./translate.service.ts";
import { ensureModel, loadEngine } from "./translate-engine.ts";

/**
 * The Russian → English translator, or `undefined` when none is configured
 * (`TRANSLATE_LIB_PATH` empty) or it can't start (library or model missing,
 * download failed): the orchestrator then works exactly as before, on the
 * message as typed. Loaded once at start, before the first message arrives.
 */
export async function loadTranslator(
	onError: (error: unknown) => void,
): Promise<{ translate: Translate; close: () => void } | undefined> {
	if (!config.TRANSLATE_LIB_PATH) return undefined;
	try {
		await ensureModel(config.TRANSLATE_MODEL_DIR, config.TRANSLATE_MODEL_REPO);
		const engine = loadEngine({
			libPath: config.TRANSLATE_LIB_PATH,
			modelDir: config.TRANSLATE_MODEL_DIR,
			threads: config.TRANSLATE_THREADS,
			computeType: config.TRANSLATE_COMPUTE_TYPE,
		});
		return { translate: createTranslator(engine), close: engine.free };
	} catch (error) {
		onError(error);
		return undefined;
	}
}
