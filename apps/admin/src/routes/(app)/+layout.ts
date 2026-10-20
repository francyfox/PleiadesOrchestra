import { isStaff } from "#lib/auth-redirect.js";
import { prefetch } from "#lib/query/prefetch.js";
import { queries } from "#lib/query/queries.js";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ fetch, parent }) => {
	const { admin } = await parent();
	// The host probe is staff-only: a customer's request would be a 403.
	if (admin && isStaff(admin.level)) await prefetch(fetch, queries.system());
};
