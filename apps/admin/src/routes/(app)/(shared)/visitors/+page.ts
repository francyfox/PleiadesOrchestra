import { prefetch } from "#lib/query/prefetch.js";
import { liveQueries, queries } from "#lib/query/queries.js";
import {
	parseVisitorsState,
	toVisitorsQuery,
} from "#lib/visitors-table-state.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
	const state = parseVisitorsState(url.searchParams);
	await Promise.all([
		prefetch(fetch, liveQueries.visitors(toVisitorsQuery(state))),
		// Every channel, unpaged — they fill the filter's select.
		prefetch(fetch, queries.allChannels()),
	]);
	return { state };
};
