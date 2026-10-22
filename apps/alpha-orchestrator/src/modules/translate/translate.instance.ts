import { agentSettings } from "../agent-settings/agent-settings.instance.ts";
import { config } from "../config/config.service.ts";
import { ensureModel, translateModelDir } from "./translate-engine.ts";
import { createTranslatePool, workerEntryUrl } from "./translate-pool.ts";

/** The translator's model from providers.toml (the first model of type `translation`), else the env repo. */
export function translatorModel(): { provider: string | null; repo: string } {
	for (const p of agentSettings.providersView()) {
		const model = p.models.find((m) => m.type === "translation");
		if (model) return { provider: p.id, repo: model.id };
	}
	return { provider: null, repo: config.TRANSLATE_MODEL_REPO };
}

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
		// shortcut: the model is read once at start, so a change in providers.toml needs a restart; hot reload = download + pool swap.
		const { repo } = translatorModel();
		const modelDir = translateModelDir(repo, {
			dir: config.TRANSLATE_MODEL_DIR,
			repo: config.TRANSLATE_MODEL_REPO,
		});
		await ensureModel(modelDir, repo);
		const pool = await createTranslatePool({
			workerUrl: workerEntryUrl("modules/translate/translate.worker"),
			init: {
				libPath: config.TRANSLATE_LIB_PATH,
				modelDir,
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
