import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => ({
	actions: (await loaded(createApi(fetch).goap.actions.get())).actions,
});
