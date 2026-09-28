import { DEFAULT_PAGE_SIZE, parsePage } from "$lib/pagination";
import { prefetch } from "$lib/query/prefetch";
import { liveQueries, queries } from "$lib/query/queries";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url }) => {
	const page = parsePage(url.searchParams.get("page"));
	await Promise.all([
		prefetch(liveQueries["blocked-ips"]({ page, pageSize: DEFAULT_PAGE_SIZE })),
		// Every channel, unpaged — they fill the form's select.
		prefetch(queries.allChannels()),
	]);
	return { page };
};
