/** Account levels (admin-api `accounts.schema.ts`): staff = 0 super admin, 100 admin; customers are 200. */
export const STAFF_MAX_LEVEL = 100;

export const isStaff = (level: number) => level <= STAFF_MAX_LEVEL;

/** Pages an anonymous visitor may open: the staff token form and the customer forms. */
const PUBLIC_PAGES = [
	"/login",
	"/user/login",
	"/user/register",
	"/user/forgot",
	"/user/reset",
];

/** The only pages a customer (level 200) may open; staff open everything else. */
const USER_PAGES = [
	"/",
	"/channels",
	"/visitors",
	"/flow",
	"/blocked-ips",
	"/faq",
	"/settings",
	"/billing",
];

/** Customer-only pages (own account settings, billing): staff have no customer account. */
const USER_ONLY_PAGES = ["/settings", "/billing"];

const under = (pathname: string, page: string) =>
	page === "/"
		? pathname === "/"
		: pathname === page || pathname.startsWith(`${page}/`);

/** Whether an account of this level may open `pathname`. */
export const canOpen = (level: number, pathname: string) =>
	isStaff(level)
		? !USER_ONLY_PAGES.some((page) => under(pathname, page))
		: USER_PAGES.some((page) => under(pathname, page));

export interface AuthRedirectInput {
	pathname: string;
	/** Level of the signed-in account, `null` when nobody is signed in. */
	level: number | null;
}

/**
 * Where a request must be redirected before it reaches a page, or `null` to
 * serve it. Anonymous visitors get the sign-in forms and are sent to `/login`
 * otherwise; a signed-in account leaves them for `/`; a customer is sent
 * `/` from staff pages. `/api/auth/*` is never redirected.
 */
export function resolveAuthRedirect({
	pathname,
	level,
}: AuthRedirectInput): string | null {
	if (pathname.startsWith("/api/auth/")) return null;

	const isPublic = PUBLIC_PAGES.some((page) => under(pathname, page));
	if (level === null) return isPublic ? null : "/login";
	if (isPublic) return "/";
	return canOpen(level, pathname) ? null : "/";
}
