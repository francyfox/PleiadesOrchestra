import { type Handle, redirect } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { resolveAuthRedirect } from "$lib/auth-redirect";
import { resolveLocale } from "$lib/server/locale";
import { hasAdmin, services } from "$lib/server/services";

export const handle: Handle = async ({ event, resolve }) => {
	const { auth } = services();

	event.locals.locale = resolveLocale({
		getCookie: (name) => event.cookies.get(name) ?? null,
		getHeader: (name) => event.request.headers.get(name),
	});

	// svelteKitHandler doesn't populate locals itself.
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	const target = resolveAuthRedirect({
		pathname: event.url.pathname,
		hasAdmin: await hasAdmin(),
		isLoggedIn: session !== null,
	});
	if (target) redirect(303, target);

	const locale = event.locals.locale;
	return svelteKitHandler({
		event,
		// <html lang> for screen readers and hyphenation; the page itself
		// renders in `locale` via setupIntlayer in the root layout.
		resolve: (e) =>
			resolve(e, {
				// app.html ships lang="ru" (a valid default for linters/a11y).
				transformPageChunk: ({ html }) =>
					html.replace('<html lang="ru">', `<html lang="${locale}">`),
			}),
		auth,
		building,
	});
};
