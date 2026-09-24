import { type Handle, redirect } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { resolveAuthRedirect } from "$lib/auth-redirect";
import { hasAdmin, services } from "$lib/server/services";

export const handle: Handle = async ({ event, resolve }) => {
	const { auth } = services();

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

	return svelteKitHandler({ event, resolve, auth, building });
};
