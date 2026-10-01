import { Elysia } from "elysia";
import type { Auth } from "./auth.ts";

/**
 * `admin` macro: routes declared with `{ admin: true }` need a valid admin
 * session and get the signed-in account as `admin` in their context.
 */
export function requireAdmin(auth: Auth) {
	return new Elysia({ name: "admin-api.require-admin" }).macro({
		admin: {
			async resolve({ request, status }) {
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) return status(401, { error: "unauthorized" });
				return { admin: session.user };
			},
		},
	});
}
