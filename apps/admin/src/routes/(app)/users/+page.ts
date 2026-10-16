import { prefetch } from "#lib/query/prefetch.js";
import { liveQueries, queries } from "#lib/query/queries.js";
import { parseUsersState, toUsersQuery } from "#lib/users-table-state.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
	const state = parseUsersState(url.searchParams);
	await Promise.all([
		prefetch(fetch, liveQueries.users(toUsersQuery(state))),
		// Every channel, unpaged — they fill the filter's select.
		prefetch(fetch, queries.allChannels()),
	]);
	return { state };
};
