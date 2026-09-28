import { prefetch } from "$lib/query/prefetch";
import { queries } from "$lib/query/queries";
import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
	await prefetch(queries.goapActions());
};
