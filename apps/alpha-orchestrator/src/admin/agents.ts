export interface AgentSpec {
	id: string;
	name: string;
	role: "text" | "decision";
	/** As configured — may carry credentials; only `publicEndpoint()` of it leaves the process. */
	baseUrl: string;
	model: string | null;
}

export interface AgentHealth {
	id: string;
	name: string;
	role: "text" | "decision";
	endpoint: string;
	model: string | null;
	status: "up" | "down";
	latencyMs: number | null;
	checkedAt: number;
}

/** What a probe needs from `fetch` (Bun's `typeof fetch` also demands `preconnect`). */
export type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export interface ProbeOptions {
	fetch?: FetchLike;
	now?: () => number;
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1500;

/** llama-server serves `/health` at its root, while `LLM_BASE_URL` is the OpenAI-style `…/v1`. */
export function healthUrl(baseUrl: string): string {
	return `${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/health`;
}

/** The base URL without userinfo, query or fragment; "" if it isn't a URL (never echoed raw). */
export function publicEndpoint(baseUrl: string): string {
	try {
		const url = new URL(baseUrl);
		return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
	} catch {
		return "";
	}
}

/**
 * Checks every agent's `/health` in parallel. Never throws: an unreachable,
 * slow or non-2xx agent is just `down`. No credentials are sent — health
 * endpoints are open, and a probe must not be a way to leak the API key.
 */
export function probeAgents(
	specs: readonly AgentSpec[],
	{
		fetch: fetchFn = fetch,
		now = Date.now,
		timeoutMs = DEFAULT_TIMEOUT_MS,
	}: ProbeOptions,
): Promise<AgentHealth[]> {
	return Promise.all(
		specs.map(async (spec): Promise<AgentHealth> => {
			const startedAt = now();
			let up = false;
			try {
				const response = await fetchFn(healthUrl(spec.baseUrl), {
					signal: AbortSignal.timeout(timeoutMs),
				});
				up = response.ok;
			} catch {
				up = false;
			}
			const checkedAt = now();
			return {
				id: spec.id,
				name: spec.name,
				role: spec.role,
				endpoint: publicEndpoint(spec.baseUrl),
				model: spec.model,
				status: up ? "up" : "down",
				latencyMs: up ? checkedAt - startedAt : null,
				checkedAt,
			};
		}),
	);
}
