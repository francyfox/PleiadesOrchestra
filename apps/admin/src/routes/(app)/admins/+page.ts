import { DEFAULT_PAGE_SIZE, parsePage } from "#lib/pagination.js";
import { prefetch } from "#lib/query/prefetch.js";
import { liveQueries } from "#lib/query/queries.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url }) => {
	const page = parsePage(url.searchParams.get("page"));
	await prefetch(liveQueries.admins({ page, pageSize: DEFAULT_PAGE_SIZE }));
	return { page };
};
