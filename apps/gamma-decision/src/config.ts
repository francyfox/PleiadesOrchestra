import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function buildConfig(env: Record<string, string | undefined>) {
	return createEnv({
		server: {
			NODE_ENV: z
				.enum(["production", "test", "development"])
				.default("development"),

			PORT: z.coerce.number().default(8080),

			// Shared secret — apps/alpha-orchestrator's DecisionAgent sends this as
			// `Authorization: Bearer <key>` to reach this service.
			LAYA_API_KEY: z.string().min(1),

			// HuggingFace repo `@receptron/laya` downloads ONNX weights from on
			// first use (cached under ~/.cache/receptron-laya afterwards).
			LAYA_MODEL_REPO: z.string().default("receptron/laya-onnx"),
			// Optional subfolder within that repo, e.g. "multilingual".
			LAYA_MODEL_SUBFOLDER: z.string().optional(),

			// onnxruntime intra-op threads; 0 = onnxruntime's default. 6 = the
			// physical cores of the target Ryzen 5 5600H (see decision-engine.ts).
			LAYA_THREADS: z.coerce.number().int().min(0).default(6),
		},
		runtimeEnv: env,
	});
}
