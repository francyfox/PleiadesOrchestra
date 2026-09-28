import type { FetchQueryOptions, QueryKey } from "@tanstack/query-core";
import { throwAsPage } from "$lib/api/result";
import { queryClient } from "./client";

/**
 * For `load`: puts a query's data in the cache before the page renders, so
 * the page's own `createQuery` starts with data. Cached data is used at once
 * (and refreshed in the background if it has gone stale); a failure becomes
 * the matching error page — or /login for a lapsed session — instead of a
 * retry that would hold the navigation.
 */
export async function prefetch<TData, TKey extends QueryKey>(
	options: FetchQueryOptions<TData, Error, TData, TKey>,
): Promise<TData> {
	try {
		return await queryClient.ensureQueryData({
			...options,
			retry: false,
			revalidateIfStale: true,
		});
	} catch (failure) {
		throwAsPage(failure);
	}
}

/** Data the route's `load` prefetched; a missing entry means a `load` forgot to. */
export function prefetched<T>(query: { data: T | undefined }): T {
	if (query.data === undefined)
		throw new Error("query data was not prefetched");
	return query.data;
}
