export interface AuthRedirectInput {
	pathname: string;
	/** At least one admin account exists — public registration is closed. */
	hasAdmin: boolean;
	isLoggedIn: boolean;
}

/**
 * Where a request must be redirected before it reaches a page, or `null` to
 * serve it. First run (no admin yet) funnels everything to `/register`;
 * afterwards `/register` is closed and everything but `/login` needs a session.
 * better-auth's own `/api/auth/*` endpoints are never redirected — they
 * enforce the same rules at the API level (see `auth.ts`).
 */
export function resolveAuthRedirect({
	pathname,
	hasAdmin,
	isLoggedIn,
}: AuthRedirectInput): string | null {
	if (pathname.startsWith("/api/auth/")) return null;

	if (!hasAdmin) return pathname === "/register" ? null : "/register";

	const isAuthPage = pathname === "/login" || pathname === "/register";
	if (isLoggedIn) return isAuthPage ? "/" : null;
	if (pathname === "/login") return null;
	return "/login";
}
