import { prefetch } from "#lib/query/prefetch.js";
import { queries } from "#lib/query/queries.js";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ fetch }) => {
	await prefetch(fetch, queries.system());
};
