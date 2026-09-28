import { prefetch } from "$lib/query/prefetch";
import { liveQueries, queries } from "$lib/query/queries";
import { parseUsersState, toUsersQuery } from "$lib/users-table-state";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url }) => {
	const state = parseUsersState(url.searchParams);
	await Promise.all([
		prefetch(liveQueries.users(toUsersQuery(state))),
		// Every channel, unpaged — they fill the filter's select.
		prefetch(queries.allChannels()),
	]);
	return { state };
};
