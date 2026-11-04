import { prefetch } from "#lib/query/prefetch.js";
import { queries } from "#lib/query/queries.js";
import { parseUsersQuery } from "#lib/users-query.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
	const query = parseUsersQuery(url.searchParams);
	await prefetch(fetch, queries.accounts(query));
	return { query };
};
