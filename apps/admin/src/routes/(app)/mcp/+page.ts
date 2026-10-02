import { prefetch } from "$lib/query/prefetch";
import { liveQueries } from "$lib/query/queries";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url }) => {
	await prefetch(liveQueries.mcp({}));
	return { id: url.searchParams.get("id") };
};
