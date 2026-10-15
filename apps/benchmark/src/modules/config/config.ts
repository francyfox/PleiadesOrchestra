import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function buildConfig(env: Record<string, string | undefined>) {
	return createEnv({
		server: {
			// A delta (llama-server) already running elsewhere, e.g. on another
			// machine. Unset: `bun tools` starts one locally in Docker.
			DELTA_BASE_URL: z
				.url()
				.transform((url) => url.replace(/\/+$/, "").replace(/\/v1$/, ""))
				.optional(),
			// delta's API_KEY (FUNCTION_CALL_API_KEY in the root .env).
			DELTA_API_KEY: z.string().optional(),
			// Model name sent with each request: llama-server ignores it, Ollama
			// and other multi-model servers need it (e.g. `qwen2.5-coder:7b`).
			DELTA_MODEL: z.string().optional(),
			// gamma-decision's root (or the same API on a GPU box); the client appends
			// /v1/systemone.
			// Unset: Laya loads in the benchmark's own process (CPU).
			LAYA_BASE_URL: z
				.url()
				.transform((url) => url.replace(/\/+$/, "").replace(/\/v1$/, ""))
				.optional(),
			LAYA_API_KEY: z.string().optional(),
		},
		runtimeEnv: env,
		emptyStringAsUndefined: true,
	});
}
