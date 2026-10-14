import { createTranslator } from "./translate.service.ts";
import { loadEngine } from "./translate-engine.ts";
import { serveTranslations } from "./translate-protocol.ts";

type EngineOptions = Parameters<typeof loadEngine>[0];

// Worker entry: the bun:ffi handle to CTranslate2 lives in this thread only.
// Listed as an extra entrypoint in the `build` script and the Dockerfile.
serveTranslations((options: EngineOptions) =>
	createTranslator(loadEngine(options)),
);
