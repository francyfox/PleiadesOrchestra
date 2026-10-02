export interface AgentSpec {
	id: string;
	name: string;
	role: "text" | "decision" | "function-call";
	/** As configured — may carry credentials; only `publicEndpoint()` of it leaves the process. */
	baseUrl: string;
	model: string | null;
}

export interface AgentHealth {
	id: string;
	name: string;
	role: "text" | "decision" | "function-call";
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

/**
 * System prompt of the request-extraction agent. Short and example-driven: a
 * 1B model follows "answer with this JSON, like these" far better than a rule
 * list. The query is always English: tool catalogs are English.
 */
export function productRequestPrompt(): string {
	return (
		"Ты помогаешь покупателю. Из его сообщения выдели один товар и количество.\n" +
		'Ответь ТОЛЬКО JSON, без пояснений: {"query": "<товар по-английски, 1-3 слова, единственное число>", "quantity": <целое число>}.\n' +
		"Если количество не названо, quantity = 1.\n" +
		"Примеры:\n" +
		'«купи 1 сыр» → {"query": "cheese", "quantity": 1}\n' +
		'«добавь три молока в корзину» → {"query": "milk", "quantity": 3}\n' +
		'«хочу яблоки» → {"query": "apples", "quantity": 1}'
	);
}
