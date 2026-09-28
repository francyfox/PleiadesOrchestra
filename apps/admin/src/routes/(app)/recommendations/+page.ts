import { prefetch } from "$lib/query/prefetch";
import { queries } from "$lib/query/queries";
import type { PageLoad } from "./$types";

/** The audit scores the host snapshot the layout already fetched — a second probe would measure CPU load over a few milliseconds. */
export const load: PageLoad = async () => {
	await prefetch(queries.system());
};
