import type { Problem } from "$lib/live/connection-monitor";

type Report = (problem: Problem, source: string, down: boolean) => void;

const SOURCE = "http";
/** admin-api answers these when the orchestrator behind it is unreachable or slow. */
const UPSTREAM_DOWN = new Set([502, 503, 504]);

/**
 * Wraps a `fetch` so every request tells the connection monitor how it went:
 * no answer at all → the server is unreachable, 502/503/504 → the data source
 * behind it is not answering, anything else → both fine again. Requests
 * cancelled on purpose are ignored. Responses and errors pass through unchanged.
 */
export function withConnectionReport(
	fetcher: typeof fetch,
	report: Report,
): typeof fetch {
	const wrapped = async (...args: Parameters<typeof fetch>) => {
		let response: Response;
		try {
			response = await fetcher(...args);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError"))
				report("socket", SOURCE, true);
			throw error;
		}
		report("socket", SOURCE, false);
		report("upstream", SOURCE, UPSTREAM_DOWN.has(response.status));
		return response;
	};
	return wrapped as typeof fetch;
}
