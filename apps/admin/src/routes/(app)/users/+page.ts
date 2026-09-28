import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import { parseUsersState, toUsersQuery } from "$lib/users-table-state";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
	const state = parseUsersState(url.searchParams);
	const api = createApi(fetch);
	const [page, channels] = await Promise.all([
		loaded(api.users.get({ query: toUsersQuery(state) })),
		loaded(api.channels.get()),
	]);
	return { state, page, channels: channels.items };
};
