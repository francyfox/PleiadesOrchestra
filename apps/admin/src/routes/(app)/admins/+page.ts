import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import { DEFAULT_PAGE_SIZE, parsePage } from "$lib/pagination";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
	const page = parsePage(url.searchParams.get("page"));
	const { admins, total } = await loaded(
		createApi(fetch).admins.get({
			query: { page, pageSize: DEFAULT_PAGE_SIZE },
		}),
	);
	return { admins, total, page };
};
