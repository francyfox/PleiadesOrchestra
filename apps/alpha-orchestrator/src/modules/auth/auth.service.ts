import { hasBearer } from "@repo/elysia-kit";
import { isPublicWidgetPath } from "../widget/widget.service.ts";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface AuthKeys {
	/** Transport secret (telegram-bot, cli, integration backends). */
	apiKey: string;
	/** Separate secret for `/v1/admin/*` (apps/admin-api). */
	adminApiKey: string;
}

export interface Rejection {
	status: number;
	body: string;
}

function isAdminPath(pathname: string): boolean {
	return pathname === "/v1/admin" || pathname.startsWith("/v1/admin/");
}

/** Liveness and API docs stay open so they can be reached without the shared secret. */
function isOpenPath(pathname: string): boolean {
	return pathname === "/health" || pathname.startsWith("/swagger");
}

/**
 * Decides whether a request may proceed: `undefined` to let it through, or the
 * rejection to answer with. Two disjoint secrets — the transport key never
 * reaches `/v1/admin/*` and the admin key never reaches the transport routes.
 * The widget's public routes check their own credentials (publishable key,
 * visitor token, channel secret) instead.
 */
export function authorizeRequest(
	request: Request,
	keys: AuthKeys,
): Rejection | undefined {
	const pathname = new URL(request.url).pathname;
	if (isOpenPath(pathname) || isPublicWidgetPath(pathname)) return;

	if (isAdminPath(pathname)) {
		if (!hasBearer(request, keys.adminApiKey)) {
			return { status: 401, body: "Unauthorized" };
		}
		if (
			MUTATING_METHODS.has(request.method) &&
			!request.headers.get("x-admin-id")
		) {
			return { status: 400, body: "X-Admin-Id header required" };
		}
		return;
	}

	if (!hasBearer(request, keys.apiKey)) {
		return { status: 401, body: "Unauthorized" };
	}
}
