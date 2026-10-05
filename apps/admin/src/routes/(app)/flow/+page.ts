import { parseIntent, parseStatus } from "$lib/flow-filters";
import { DEFAULT_PAGE_SIZE, parsePage } from "$lib/pagination";
import { prefetch } from "$lib/query/prefetch";
import { liveQueries } from "$lib/query/queries";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url }) => {
	const page = parsePage(url.searchParams.get("page"));
	const status = parseStatus(url.searchParams.get("status"));
	const intent = parseIntent(url.searchParams.get("intent"));
	await prefetch(
		liveQueries.requests({
			page,
			pageSize: DEFAULT_PAGE_SIZE,
			...(status && { status }),
			...(intent && { intent }),
		}),
	);
	return { page, status, intent };
};
