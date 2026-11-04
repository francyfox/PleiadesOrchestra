import { redirect } from "@sveltejs/kit";

/** Account levels (admin-api `accounts.schema.ts`): staff = 0 super admin, 100 admin; customers are 200. */
export const STAFF_MAX_LEVEL = 100;

export const isStaff = (level: number) => level <= STAFF_MAX_LEVEL;

/** Who a page is for; the route group's guard decides, the sidebar only hides what a guard would refuse. */
export type Audience = "all" | "staff" | "customer";

export const allows = (audience: Audience, level: number) =>
	audience === "all" || (audience === "staff") === isStaff(level);

export interface GuardContext {
	/** The signed-in account, `null` when nobody is signed in. */
	admin: { level: number } | null;
	url: URL;
}

/**
 * A route guard in the Angular `canActivate` style: `true` lets the page
 * open, a path redirects there. Pure, so it is tested without a router.
 */
export type Guard = (ctx: GuardContext) => true | string;

/** `login`, remembering the page asked for (`?redirect=`) unless it is the home page. */
function toLogin(login: string, url: URL): string {
	const target = url.pathname + url.search;
	return target === "/"
		? login
		: `${login}?redirect=${encodeURIComponent(target)}`;
}

/** Where to go after signing in: `?redirect=` when it is a path of this site, else home. */
export function afterSignIn(url: {
	searchParams: { get(name: string): string | null };
}): string {
	const target = url.searchParams.get("redirect") ?? "";
	// "//host" and "/\host" are other sites to a browser.
	return /^\/(?![/\\])/.test(target) ? target : "/";
}

/** `?redirect=` of this URL for a link to another sign-in form (login <-> register), or nothing. */
export function keepRedirect(url: {
	searchParams: { get(name: string): string | null };
}): "" | `?redirect=${string}` {
	const target = url.searchParams.get("redirect");
	return target ? `?redirect=${encodeURIComponent(target)}` : "";
}

/** Any account; anonymous visitors go to the customer sign-in. */
export const signedIn: Guard = ({ admin, url }) =>
	admin ? true : toLogin("/user/login", url);

/** Staff only; anonymous visitors go to the staff (token) sign-in, customers home. */
export const staffOnly: Guard = ({ admin, url }) =>
	!admin ? toLogin("/login", url) : isStaff(admin.level) || "/";

/** Customers only (billing, own settings): staff have no customer account. Put after `signedIn`. */
export const customerOnly: Guard = ({ admin }) =>
	!admin || !isStaff(admin.level) || "/";

/** The sign-in forms: a signed-in account goes on to where it was going. */
export const guestOnly: Guard = ({ admin, url }) => !admin || afterSignIn(url);

/**
 * A route group's `load`: runs the guards in order (like `canActivate: [a, b]`)
 * and redirects on the first that refuses. The session comes from the root layout.
 */
export function guard(...guards: Guard[]) {
	return async ({
		parent,
		url,
	}: {
		parent: () => Promise<{ admin?: GuardContext["admin"] }>;
		url: URL;
	}) => {
		const { admin } = await parent();
		for (const check of guards) {
			const result = check({ admin: admin ?? null, url });
			if (result !== true) redirect(303, result);
		}
	};
}
