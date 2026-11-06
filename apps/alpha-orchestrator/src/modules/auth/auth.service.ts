import { hasBearer, type Rejection } from "@repo/elysia-kit";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface AuthKeys {
	/** Transport secret (telegram-bot, cli, integration backends). */
	apiKey: string;
	/** Separate secret for `/v1/admin/*` (apps/admin-api). */
	adminApiKey: string;
}

export type { Rejection };

/**
 * The two disjoint secrets: the transport key never reaches `/v1/admin/*` and
 * the admin key never reaches the transport routes. Which routes sit behind
 * which is decided by the group they are registered in (`app.ts`), not by path.
 */
export function authorizeTransport(
	request: Request,
	keys: AuthKeys,
): Rejection | undefined {
	if (!hasBearer(request, keys.apiKey)) {
		return { status: 401, body: "Unauthorized" };
	}
}

export function authorizeAdmin(
	request: Request,
	keys: AuthKeys,
): Rejection | undefined {
	// CORS preflights carry no credentials — let the route handler reply with
	// the appropriate CORS headers (or 403 for unknown origins) without auth.
	if (request.method === "OPTIONS") return;
	if (!hasBearer(request, keys.adminApiKey)) {
		return { status: 401, body: "Unauthorized" };
	}
	if (
		MUTATING_METHODS.has(request.method) &&
		!request.headers.get("x-admin-id")
	) {
		return { status: 400, body: "X-Admin-Id header required" };
	}
}
