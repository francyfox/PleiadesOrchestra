import { error } from "@sveltejs/kit";
import { prefetch } from "$lib/query/prefetch";
import { liveQueries } from "$lib/query/queries";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
	const { items } = await prefetch(liveQueries.mcp({}));
	if (!items.some((site) => site.channelId === params.id))
		error(404, "Site not found");
	return { id: params.id };
};
