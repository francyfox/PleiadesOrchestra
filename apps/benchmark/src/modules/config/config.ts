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
			// `bun openrouter`: delta's candidates on OpenRouter (https://openrouter.ai/settings/keys).
			OPENROUTER_API_KEY: z.string().optional(),
			// `bun efficiency`: the orchestrator's root and its HARNESS_API_KEY
			// (beta alone through /v1/chat/completions), a web channel of it
			// (publishable key + one of its allowed origins) for the orchestrator
			// side, and optionally ADMIN_API_KEY: every model call of a request,
			// not only the reply's.
			ORCHESTRA_BASE_URL: z
				.url()
				.transform((url) => url.replace(/\/+$/, ""))
				.optional(),
			ORCHESTRA_API_KEY: z.string().optional(),
			ORCHESTRA_PUBLISHABLE_KEY: z.string().optional(),
			ORCHESTRA_ORIGIN: z.string().optional(),
			ORCHESTRA_ADMIN_API_KEY: z.string().optional(),
			// `bun replay`: the OpenAI-compatible server of the local models (a llama-server
			// router, `/v1` included) and its key.
			REPLAY_BASE_URL: z
				.url()
				.transform((url) => url.replace(/\/+$/, ""))
				.optional(),
			REPLAY_API_KEY: z.string().optional(),
		},
		runtimeEnv: env,
		emptyStringAsUndefined: true,
	});
}
