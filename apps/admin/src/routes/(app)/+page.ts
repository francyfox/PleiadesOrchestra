import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ fetch }) =>
	loaded(createApi(fetch).dashboard.get());
