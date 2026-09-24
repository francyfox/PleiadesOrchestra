export interface BearerJsonClientConfig {
	baseURL: string;
	apiKey: string;
	fetchImpl?: typeof fetch;
}

/**
 * Shared low-level primitive behind every bearer-authed JSON POST in this
 * package — one small composable function (atom composition, not a base
 * class `Agent`/`DecisionAgent` extend), so both ports get the same
 * request/error shape without duplicating it.
 */
export function createBearerJsonClient(config: BearerJsonClientConfig) {
	const fetchImpl = config.fetchImpl ?? fetch;
	const headers = {
		"content-type": "application/json",
		authorization: `Bearer ${config.apiKey}`,
	};

	return async function postJson<T>(path: string, body: unknown): Promise<T> {
		const response = await fetchImpl(`${config.baseURL}${path}`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw new Error(
				`POST ${path} failed: ${response.status} ${response.statusText}`,
			);
		}

		return response.json() as Promise<T>;
	};
}
