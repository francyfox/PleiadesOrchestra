import { timingSafeEqual } from "node:crypto";
import type { Logger } from "./logger.ts";
import { logRequest, REQUEST_ID_HEADER } from "./request-log.ts";

export interface Rejection {
	status: number;
	body?: string;
}

/**
 * An `onRequest` hook that may reject a request before routing (auth checks
 * belong here: body validation would otherwise answer 422 before auth runs).
 * Elysia skips every other hook for a request rejected in `onRequest`, so the
 * rejection is written to the access log here — otherwise 401s would be the
 * one thing missing from it.
 */
export function onRequestGuard(
	logger: Logger,
	decide: (request: Request) => Rejection | undefined,
) {
	return ({
		request,
		set,
	}: {
		request: Request;
		set: {
			status?: number | string;
			headers: Record<string, string | number | undefined>;
		};
	}) => {
		const startedAt = performance.now();
		const rejection = decide(request);
		if (!rejection) return;
		set.status = rejection.status;
		logRequest(logger, {
			request,
			status: rejection.status,
			durationMs: performance.now() - startedAt,
			id: String(set.headers[REQUEST_ID_HEADER] ?? ""),
		});
		return rejection.body ?? "";
	};
}

const digest = (value: string) =>
	new Bun.CryptoHasher("sha256").update(value).digest();

/** `Authorization: Bearer <token>`, compared in constant time. An empty token never matches. */
export function hasBearer(request: Request, token: string): boolean {
	if (!token) return false;
	const header = request.headers.get("authorization") ?? "";
	return timingSafeEqual(digest(header), digest(`Bearer ${token}`));
}
