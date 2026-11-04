import { parsePlanStatus } from "#lib/plan-filters.js";
import { prefetch } from "#lib/query/prefetch.js";
import { queries } from "#lib/query/queries.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
	const status = parsePlanStatus(url.searchParams.get("status"));
	await prefetch(fetch, queries.subscriptions(status));
	return { status };
};
