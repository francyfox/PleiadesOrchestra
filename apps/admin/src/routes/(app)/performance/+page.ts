import { prefetch } from "#lib/query/prefetch.js";
import { liveQueries } from "#lib/query/queries.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
	await prefetch(liveQueries.performance({}));
};
