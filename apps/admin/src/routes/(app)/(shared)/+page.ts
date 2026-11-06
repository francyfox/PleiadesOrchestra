import { isStaff } from "#lib/guards.js";
import { prefetch } from "#lib/query/prefetch.js";
import { liveQueries } from "#lib/query/queries.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, parent }) => {
	const { admin } = await parent();
	await prefetch(fetch, liveQueries.dashboard({}));
	return { staff: !admin || isStaff(admin.level) };
};
