import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => ({
	report: await loaded(createApi(fetch).performance.get({ query: {} })),
});
