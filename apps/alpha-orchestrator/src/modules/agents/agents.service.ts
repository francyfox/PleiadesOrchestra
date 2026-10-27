import type { Db } from "../database/database.ts";

export interface AgentSpec {
	id: string;
	name: string;
	role: "text" | "decision" | "function-call" | "understand";
	/** As configured — may carry credentials; only `publicEndpoint()` of it leaves the process. */
	baseUrl: string;
	model: string | null;
}

export interface AgentHealth {
	id: string;
	name: string;
	role: "text" | "decision" | "function-call" | "understand";
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

/** The OpenAI-style model list, answered by Ollama and other servers without `/health`. */
export function modelsUrl(baseUrl: string): string {
	return `${baseUrl.replace(/\/+$/, "")}/models`;
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

const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** What the ledger calls the model of each agent's calls, besides the model it is configured with: Laya names itself on decision rows. */
const LEDGER_ALIASES: Record<string, string[]> = {
	decision: ["laya-system-one", "gamma-decision"],
};

/** Mean latency of the successful calls of each model in the last 24 h (the ledger, `llm_calls`). */
export function meanLatencies(db: Db, now: number): Map<string, number> {
	const rows = db.$client
		.query<{ model: string; mean: number }, [number]>(
			"SELECT model, CAST(ROUND(AVG(latency_ms)) AS INTEGER) AS mean FROM llm_calls WHERE ok = 1 AND at >= ? GROUP BY model",
		)
		.all(now - RESPONSE_WINDOW_MS);
	return new Map(rows.map((row) => [row.model, row.mean]));
}

/** The agent's real response time: its configured model's mean, else that of the name its ledger rows use. */
export function responseMsOf(
	agent: Pick<AgentHealth, "role" | "model">,
	means: Map<string, number>,
): number | null {
	for (const model of [agent.model, ...(LEDGER_ALIASES[agent.role] ?? [])]) {
		const mean = model ? means.get(model) : undefined;
		if (mean !== undefined) return mean;
	}
	return null;
}

/** A hosted decisions API (OpenRouter `…/decisions`): it has no `/health`, so only the host answering at all tells it is reachable. */
const isHostedDecisions = (spec: AgentSpec) =>
	spec.role === "decision" && /\/decisions\/?$/.test(spec.baseUrl);

/** True when a GET to `url` answers within the timeout (2xx, or with `anyStatus` anything below 500); never throws. */
async function answers(
	fetchFn: FetchLike,
	url: string,
	timeoutMs: number,
	anyStatus = false,
): Promise<boolean> {
	try {
		const response = await fetchFn(url, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		return anyStatus ? response.status < 500 : response.ok;
	} catch {
		return false;
	}
}

/**
 * Checks every agent's `/health` in parallel. The text and function-call
 * agents may sit on an OpenAI-compatible server without `/health` (Ollama):
 * when `/health` fails they get a second try on `{base}/models`. Never throws:
 * an unreachable, slow or non-2xx agent is just `down`. No credentials are sent — health
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
			let up = isHostedDecisions(spec)
				? await answers(fetchFn, spec.baseUrl, timeoutMs, true)
				: await answers(fetchFn, healthUrl(spec.baseUrl), timeoutMs);
			if (!up && spec.role !== "decision") {
				up = await answers(fetchFn, modelsUrl(spec.baseUrl), timeoutMs);
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
