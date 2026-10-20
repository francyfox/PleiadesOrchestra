import { DEFAULT_PAGE_SIZE, parsePage } from "#lib/pagination.js";
import { prefetch } from "#lib/query/prefetch.js";
import { queries } from "#lib/query/queries.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
	const page = parsePage(url.searchParams.get("page"));
	await prefetch(
		fetch,
		queries.accounts({ page, pageSize: DEFAULT_PAGE_SIZE }),
	);
	return { page };
};
