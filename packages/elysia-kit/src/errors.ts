/** Elysia error codes that are the client's fault — never worth an alert. */
const CLIENT_CODES = new Set([
	"VALIDATION",
	"NOT_FOUND",
	"PARSE",
	"INVALID_COOKIE_SIGNATURE",
	"INVALID_FILE_TYPE",
]);

/**
 * Whether an error is a fault of this service (unhandled exception, or a
 * custom error mapped to 5xx) rather than a rejected request. Shared by the
 * logger and Sentry so both agree on what counts as an incident.
 */
export function isServerFault(code: string | number, error: unknown): boolean {
	if (typeof code === "number") return code >= 500;
	if (CLIENT_CODES.has(code)) return false;
	const status = (error as { status?: unknown } | null)?.status;
	return typeof status === "number" ? status >= 500 : true;
}
