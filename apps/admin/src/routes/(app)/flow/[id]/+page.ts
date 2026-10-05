import { prefetch } from "$lib/query/prefetch";
import { liveQueries } from "$lib/query/queries";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
	await prefetch(liveQueries.request({ id: params.id }));
	return { id: params.id };
};
