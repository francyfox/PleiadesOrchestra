import { DEFAULT_PAGE_SIZE, parsePage } from "#lib/pagination.js";
import { prefetch } from "#lib/query/prefetch.js";
import { liveQueries, queries } from "#lib/query/queries.js";
import type { PageLoad } from "./$types";

const STATUSES = ["pending", "approved", "rejected"] as const;

export const load: PageLoad = async ({ fetch, url }) => {
	const page = parsePage(url.searchParams.get("page"));
	// Waiting for a verdict is what the page is for; "any" is an explicit choice.
	const asked = url.searchParams.get("status");
	const status =
		asked === "any"
			? undefined
			: (STATUSES.find((value) => value === asked) ?? "pending");
	const channelId = url.searchParams.get("channel") || undefined;
	await Promise.all([
		prefetch(
			fetch,
			liveQueries.intents({
				page,
				pageSize: DEFAULT_PAGE_SIZE,
				...(status && { status }),
				...(channelId && { channelId }),
			}),
		),
		prefetch(fetch, queries.allChannels()),
	]);
	return { page, status, channelId };
};
