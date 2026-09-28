import { DEFAULT_PAGE_SIZE, parsePage } from "$lib/pagination";
import { prefetch } from "$lib/query/prefetch";
import { liveQueries } from "$lib/query/queries";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url }) => {
	const page = parsePage(url.searchParams.get("page"));
	await prefetch(liveQueries.channels({ page, pageSize: DEFAULT_PAGE_SIZE }));
	return { page };
};
