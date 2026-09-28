import { prefetch } from "$lib/query/prefetch";
import { queries } from "$lib/query/queries";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
	await prefetch(queries.run(params.id));
	return { id: params.id };
};
