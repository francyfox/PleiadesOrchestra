import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params }) => ({
	details: await loaded(createApi(fetch).users({ id: params.id }).get()),
});
