import { isStaff } from "#lib/auth-redirect.js";
import { DEFAULT_PAGE_SIZE, parsePage } from "#lib/pagination.js";
import { prefetch } from "#lib/query/prefetch.js";
import { liveQueries, queries } from "#lib/query/queries.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url, parent }) => {
	const { admin } = await parent();
	const staff = !admin || isStaff(admin.level);
	const page = parsePage(url.searchParams.get("page"));
	await prefetch(
		fetch,
		liveQueries.channels({ page, pageSize: DEFAULT_PAGE_SIZE }),
	);
	// Plans and owners are staff data: a customer's request would be a 403.
	if (staff) {
		await prefetch(fetch, queries.subscriptions());
		await prefetch(fetch, queries.allAccounts());
	}
	return { page, staff };
};
