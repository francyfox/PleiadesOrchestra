import { redirect } from "@sveltejs/kit";
import { createApi } from "$lib/api/client";
import { loaded } from "$lib/api/result";
import { resolveAuthRedirect } from "$lib/auth-redirect";
import { resolveBrowserLocale } from "$lib/i18n/browser-locale";
import type { LayoutLoad } from "./$types";

/**
 * The admin is a client-rendered SPA served as static files (adapter-static):
 * there is no server of its own. Everything server-side — accounts, sessions,
 * the orchestrator's data — is `apps/admin-api`, reached over `/api`.
 */
export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async ({ fetch, url }) => {
	const session = await loaded(createApi(fetch).session.get());

	const target = resolveAuthRedirect({
		pathname: url.pathname,
		hasAdmin: !session.setupRequired,
		isLoggedIn: session.admin !== null,
	});
	if (target) redirect(303, target);

	return { locale: resolveBrowserLocale(), admin: session.admin };
};
