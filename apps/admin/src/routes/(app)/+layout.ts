import { prefetch } from "#lib/query/prefetch.js";
import { queries } from "#lib/query/queries.js";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	await prefetch(queries.system());
};
