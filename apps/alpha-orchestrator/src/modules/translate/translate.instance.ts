import { config } from "../config/config.service.ts";
import { ensureModel } from "./translate-engine.ts";
import { createTranslatePool, workerEntryUrl } from "./translate-pool.ts";

/**
 * The Russian → English translator, or `undefined` when none is configured
 * (`TRANSLATE_LIB_PATH` empty) or it can't start (library or model missing,
 * download failed): the orchestrator then works exactly as before, on the
 * message as typed. Loaded once at start, before the first message arrives.
 * The engine runs in worker threads (`translate.worker.ts`), never on the
 * main thread: the native call blocks.
 */
export async function loadTranslator(
	onError: (error: unknown) => void,
): Promise<
	| { translate: (text: string) => Promise<string>; close: () => void }
	| undefined
> {
	if (!config.TRANSLATE_LIB_PATH) return undefined;
	try {
		await ensureModel(config.TRANSLATE_MODEL_DIR, config.TRANSLATE_MODEL_REPO);
		const pool = await createTranslatePool({
			workerUrl: workerEntryUrl("modules/translate/translate.worker"),
			init: {
				libPath: config.TRANSLATE_LIB_PATH,
				modelDir: config.TRANSLATE_MODEL_DIR,
				threads: config.TRANSLATE_THREADS,
				computeType: config.TRANSLATE_COMPUTE_TYPE,
			},
			size: config.TRANSLATE_WORKERS,
			timeoutMs: config.TRANSLATE_TIMEOUT_MS,
			onError,
		});
		return pool;
	} catch (error) {
		onError(error);
		return undefined;
	}
}
