import { error } from "@sveltejs/kit";
import { prefetch } from "#lib/query/prefetch.js";
import { liveQueries } from "#lib/query/queries.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params }) => {
	const { items } = await prefetch(fetch, liveQueries.mcp({}));
	if (!items.some((site) => site.channelId === params.id))
		error(404, "Site not found");
	return { id: params.id };
};
