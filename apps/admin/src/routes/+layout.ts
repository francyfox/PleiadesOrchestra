import { redirect } from "@sveltejs/kit";
import { createApi } from "$lib/api/client";
import { throwAsPage, unwrap } from "$lib/api/result";
import { resolveAuthRedirect } from "$lib/auth-redirect";
import { resolveBrowserLocale } from "$lib/i18n/browser-locale";
import { queryClient } from "$lib/query/client";
import { queries } from "$lib/query/queries";
import type { LayoutLoad } from "./$types";

/**
 * The admin is a client-rendered SPA served as static files (adapter-static):
 * there is no server of its own. Everything server-side — accounts, sessions,
 * the orchestrator's data — is `apps/admin-api`, reached over `/api`.
 */
export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async ({ fetch, url }) => {
	// Never from the cache: every navigation re-checks who is signed in.
	const session = await queryClient
		.fetchQuery({
			...queries.session(),
			// SvelteKit's own `fetch`: the one `load` is meant to use (a bare `window.fetch` here warns in dev).
			queryFn: () => unwrap(createApi(fetch).session.get()),
			staleTime: 0,
			retry: false,
		})
		.catch(throwAsPage);

	const target = resolveAuthRedirect({
		pathname: url.pathname,
		hasAdmin: !session.setupRequired,
		isLoggedIn: session.admin !== null,
	});
	if (target) redirect(303, target);

	return { locale: resolveBrowserLocale(), admin: session.admin };
};
