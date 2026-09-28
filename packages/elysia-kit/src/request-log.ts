import { Elysia } from "elysia";
import { isServerFault } from "./errors.ts";
import type { Logger } from "./logger.ts";

export interface RequestLogOptions {
	logger: Logger;
	/** Paths not worth a line each (container health checks). */
	ignorePaths?: readonly string[];
}

export const REQUEST_ID_HEADER = "x-request-id";

export interface RequestLine {
	request: Request;
	status: number;
	durationMs: number;
	id?: string;
}

/** The one shape of an access-log line, shared by the plugin and `onRequestGuard`. */
export function logRequest(logger: Logger, line: RequestLine) {
	const { request, status } = line;
	logger[status >= 500 ? "error" : status >= 400 ? "warn" : "info"]({
		message: "http_request",
		"http.request.method": request.method,
		"url.path": new URL(request.url).pathname,
		"http.response.status_code": status,
		duration_ms: Math.round(line.durationMs),
		"request.id": line.id,
	});
}

function statusOf(
	set: { status?: number | string },
	response: unknown,
): number {
	if (response instanceof Response) return response.status;
	return typeof set.status === "number" ? set.status : 200;
}

/**
 * One structured line per request: method, path (no query string, no body),
 * status and duration. Register it first so requests that a later
 * `onRequest` hook rejects (401) are timed and logged too. Also stamps an
 * `x-request-id` (kept when the caller sent one) for tracing across services.
 */
export function requestLog({
	logger,
	ignorePaths = ["/health"],
}: RequestLogOptions) {
	const started = new WeakMap<Request, { at: number; id: string }>();

	return new Elysia({ name: "kit.request-log" })
		.onRequest(({ request, set }) => {
			const id = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
			started.set(request, { at: performance.now(), id });
			set.headers[REQUEST_ID_HEADER] = id;
		})
		.onAfterResponse({ as: "global" }, ({ request, set, response }) => {
			const meta = started.get(request);
			const path = new URL(request.url).pathname;
			if (!meta || ignorePaths.includes(path)) return;
			logRequest(logger, {
				request,
				status: statusOf(set, response),
				durationMs: performance.now() - meta.at,
				id: meta.id,
			});
		})
		.onError({ as: "global" }, ({ request, code, error }) => {
			if (!isServerFault(code, error)) return;
			logger.error({
				message: "unhandled_error",
				"http.request.method": request.method,
				"url.path": new URL(request.url).pathname,
				"request.id": started.get(request)?.id,
				"error.type": error instanceof Error ? error.name : typeof error,
				"error.message": error instanceof Error ? error.message : String(error),
				"error.stack": error instanceof Error ? error.stack : undefined,
			});
		});
}
