import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import { DEFAULT_PAGE_SIZE, parsePage } from "$lib/pagination";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
	const page = parsePage(url.searchParams.get("page"));
	const { items, total } = await loaded(
		createApi(fetch).channels.get({
			query: { page, pageSize: DEFAULT_PAGE_SIZE },
		}),
	);
	return { channels: items, total, page };
};
