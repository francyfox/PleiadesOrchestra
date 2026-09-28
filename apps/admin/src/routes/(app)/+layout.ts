import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ fetch }) => ({
	system: await loaded(createApi(fetch).system.get()),
});
