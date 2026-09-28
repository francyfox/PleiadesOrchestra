import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => ({
	agents: (await loaded(createApi(fetch).agents.get())).items,
});
