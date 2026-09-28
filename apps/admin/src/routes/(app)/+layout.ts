import { prefetch } from "$lib/query/prefetch";
import { queries } from "$lib/query/queries";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	await prefetch(queries.system());
};
