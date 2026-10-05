import type { RequestStatus } from "$lib/api-types";

export const REQUEST_STATUSES = [
	"running",
	"waiting",
	"succeeded",
	"failed",
	"abandoned",
] as const satisfies readonly RequestStatus[];

/**
 * The intents a message can be classified as (`TOOL_INTENTS` in
 * `packages/core/src/goap/intent-taxonomy.ts`; the panel doesn't import core).
 * An intent outside the list still filters if it comes in the URL.
 */
export const REQUEST_INTENTS = [
	"chooseStore",
	"navigate",
	"search",
	"filter",
	"select",
	"addToCart",
	"removeFromCart",
	"checkout",
	"paginate",
	"compare",
	"other",
] as const;

export interface RequestFilters {
	status?: RequestStatus;
	intent?: string;
}

/** `?status=` from the URL: a known status, anything else means "all". */
export function parseStatus(value: string | null): RequestStatus | undefined {
	return REQUEST_STATUSES.find((status) => status === value);
}

/** `?intent=` from the URL: a short non-empty word, anything else means "all". */
export function parseIntent(value: string | null): string | undefined {
	return value && /^[\w-]{1,64}$/.test(value) ? value : undefined;
}

/** The URL of the requests list: page one is left out, and so is a filter that is off. */
export function requestsHref(
	filters: RequestFilters & { page?: number },
): string {
	const params = new URLSearchParams();
	if (filters.status) params.set("status", filters.status);
	if (filters.intent) params.set("intent", filters.intent);
	if (filters.page && filters.page > 1)
		params.set("page", String(filters.page));
	const query = params.toString();
	return query ? `?${query}` : "?";
}
