import { dirname } from "node:path";

/**
 * `packages/core/` of the checkout: next to albedo's source, else in the
 * working directory or above (a compiled albedo has a virtual import.meta.url).
 */
export async function findCore(
	cwd: string,
	exists = (path: string) => Bun.file(path).exists(),
): Promise<string | undefined> {
	const dirs = [new URL("../../../packages/core/", import.meta.url).pathname];
	for (let dir = cwd; ; dir = dirname(dir)) {
		dirs.push(`${dir === "/" ? "" : dir}/packages/core/`);
		if (dir === dirname(dir)) break;
	}
	for (const dir of dirs) {
		if (await exists(`${dir}eval/intents.ts`)) return dir;
	}
	return undefined;
}

interface Settings {
	baseUrl: string;
	apiKey: string;
	model: string;
	reasoningEffort?: string;
}

/**
 * Env for `packages/core/eval/*` from what `alpha-orchestrator agent:settings`
 * printed (its last line): the evals then ask the models the service uses.
 */
export function evalEnv(output: string): Record<string, string> {
	const last = output.trim().split("\n").at(-1) ?? "";
	let parsed: { decision?: Settings; functionCall?: Settings };
	try {
		parsed = JSON.parse(last);
	} catch {
		throw new Error(`alpha-orchestrator agent:settings: ${last}`);
	}
	const { decision, functionCall } = parsed;
	if (!decision || !functionCall) {
		throw new Error(`alpha-orchestrator agent:settings: ${last}`);
	}
	return {
		DECISION_BASE_URL: decision.baseUrl,
		DECISION_API_KEY: decision.apiKey,
		DECISION_MODEL: decision.model,
		FUNCTION_CALL_BASE_URL: functionCall.baseUrl,
		FUNCTION_CALL_API_KEY: functionCall.apiKey,
		FUNCTION_CALL_MODEL: functionCall.model,
		...(functionCall.reasoningEffort
			? { FUNCTION_CALL_REASONING_EFFORT: functionCall.reasoningEffort }
			: {}),
	};
}
