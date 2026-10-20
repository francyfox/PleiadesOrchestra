import { Elysia } from "elysia";
import { isStaff } from "../accounts/accounts.schema.ts";
import { needsTouch } from "../accounts/accounts.service.ts";
import type { Auth } from "./auth.ts";

/** The session of the request, and `last_active_at` bumped when it is more than a day old. */
export async function currentSession(auth: Auth, headers: Headers) {
	const session = await auth.api.getSession({ headers });
	if (session && needsTouch(session.user.lastActiveAt, Date.now())) {
		const { internalAdapter } = await auth.$context;
		await internalAdapter.updateUser(session.user.id, {
			lastActiveAt: new Date(),
		});
	}
	return session;
}

/**
 * Two macros. `admin: true` = staff only (level ≤ 100), puts the account in
 * the context as `admin`; `account: true` = any signed-in account (users
 * included), as `account`. 401 without a session, 403 for a user on a staff route.
 */
export function requireAdmin(auth: Auth) {
	return new Elysia({ name: "admin-api.require-admin" }).macro({
		admin: {
			async resolve({ request, status }) {
				const session = await currentSession(auth, request.headers);
				if (!session) return status(401, { error: "unauthorized" });
				if (!isStaff(session.user.level)) {
					return status(403, { error: "forbidden" });
				}
				return { admin: session.user };
			},
		},
		account: {
			async resolve({ request, status }) {
				const session = await currentSession(auth, request.headers);
				if (!session) return status(401, { error: "unauthorized" });
				return { account: session.user };
			},
		},
	});
}
