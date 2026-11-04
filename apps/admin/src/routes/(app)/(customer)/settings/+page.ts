import { prefetch } from "#lib/query/prefetch.js";
import { queries } from "#lib/query/queries.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
	await prefetch(fetch, queries.me());
};
