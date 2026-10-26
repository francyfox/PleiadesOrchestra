export type InfraCategory =
	| "http"
	| "timeout"
	| "network"
	| "model-unavailable";

/** The infrastructure failed (API, network, model), not the contender: the case run is an error, not a failed case. */
export class InfraError extends Error {
	constructor(
		readonly category: InfraCategory,
		message: string,
	) {
		super(message);
	}
}

export interface InfraOptions {
	timeoutMs?: number;
	delaysMs?: number[];
}

export const REQUEST_TIMEOUT_MS = 60_000;
/** Waits before each retry of a transient error. */
export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

const UNAVAILABLE = /no endpoints|unavailable|no provider/i;

/** The InfraError behind a thrown error (a timeout or network failure while reading a body counts too), if any. */
export function asInfra(error: unknown): InfraError | undefined {
	if (error instanceof InfraError) return error;
	if (!(error instanceof Error)) return undefined;
	if (error.name === "TimeoutError" || error.name === "AbortError")
		return new InfraError("timeout", error.message);
	if (
		error instanceof TypeError ||
		/ECONN|fetch failed|socket/i.test(error.message)
	)
		return new InfraError("network", error.message);
	return error.cause ? asInfra(error.cause) : undefined;
}

/**
 * `fetch` with a per-request timeout and a few retries of transient failures
 * (5xx, network, timeout, an error body inside HTTP 200; 429 unless
 * `retry429` is off, the widget's own rate-limit wait handles it). Whatever
 * still fails throws an InfraError, so no caller sees an error response.
 */
export function createInfraFetch(
	deps: InfraOptions & { fetch?: typeof fetch; retry429?: boolean },
): typeof fetch {
	const http = deps.fetch ?? fetch;
	const delays = deps.delaysMs ?? RETRY_DELAYS_MS;
	return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const url = String(input instanceof Request ? input.url : input);
		for (let attempt = 0; ; attempt++) {
			let failure: InfraError;
			let retry = true;
			try {
				const timeout = AbortSignal.timeout(
					deps.timeoutMs ?? REQUEST_TIMEOUT_MS,
				);
				const response = await http(input, {
					...init,
					signal: init?.signal
						? AbortSignal.any([init.signal, timeout])
						: timeout,
				});
				if (response.status === 429 && deps.retry429 === false) return response;
				if (response.ok) {
					// OpenRouter answers HTTP 200 with the error in the body.
					if (
						!response.headers
							.get("content-type")
							?.startsWith("application/json")
					)
						return response;
					const body = (await response
						.clone()
						.json()
						.catch(() => undefined)) as
						| { error?: { message?: string } }
						| undefined;
					if (!body?.error) return response;
					const message = body.error.message ?? JSON.stringify(body.error);
					failure = new InfraError(
						UNAVAILABLE.test(message) ? "model-unavailable" : "http",
						`${url}: ${message}`,
					);
					retry = !UNAVAILABLE.test(message);
				} else {
					const text = (await response.text().catch(() => "")).slice(0, 200);
					const unavailable = UNAVAILABLE.test(text);
					failure = new InfraError(
						unavailable ? "model-unavailable" : "http",
						`HTTP ${response.status} ${url}: ${text}`,
					);
					retry =
						!unavailable && (response.status === 429 || response.status >= 500);
				}
			} catch (error) {
				const infra = asInfra(error);
				if (!infra) throw error;
				failure = infra;
			}
			if (!retry || attempt >= delays.length) throw failure;
			await Bun.sleep(delays[attempt] ?? 0);
		}
	}) as typeof fetch;
}

/** Before the run: the orchestrator answers `/health` and the reply model answers one tiny completion. */
export async function checkInfrastructure(deps: {
	baseUrl: string;
	apiKey: string;
	fetch?: typeof fetch;
	delaysMs?: number[];
}): Promise<void> {
	const http = createInfraFetch({
		fetch: deps.fetch,
		delaysMs: deps.delaysMs ?? [1_000, 3_000],
	});
	try {
		await http(`${deps.baseUrl}/health`);
	} catch (error) {
		throw new Error(
			`The orchestrator at ${deps.baseUrl} is not up (GET /health): ${(error as Error).message}`,
		);
	}
	try {
		await http(`${deps.baseUrl}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${deps.apiKey}`,
			},
			body: JSON.stringify({
				model: "beta-text",
				messages: [{ role: "user", content: "ok" }],
				max_tokens: 4,
			}),
		});
	} catch (error) {
		throw new Error(
			`The reply model does not answer (POST /v1/chat/completions): ${(error as Error).message}`,
		);
	}
}
