import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import { DEFAULT_PAGE_SIZE, parsePage } from "$lib/pagination";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
	const page = parsePage(url.searchParams.get("page"));
	const api = createApi(fetch);
	const [blocked, channels] = await Promise.all([
		loaded(
			api["blocked-ips"].get({ query: { page, pageSize: DEFAULT_PAGE_SIZE } }),
		),
		// Every channel, unpaged — they fill the form's select.
		loaded(api.channels.get()),
	]);
	return {
		items: blocked.items,
		total: blocked.total,
		page,
		channels: channels.items,
	};
};
