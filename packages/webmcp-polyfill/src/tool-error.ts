/**
 * A failed tool call as it crosses windows. A tool may throw an error with a
 * numeric `status` (HTTP-like, e.g. 429 when the site's API rate-limits) and
 * optional `retryAfter` in seconds; both travel in the
 * `WEBMCP_EXECUTE_TOOL_RESPONSE` message so the caller can back off instead
 * of retrying at once.
 */
export interface ToolCallError extends Error {
	status?: number;
	retryAfter?: number;
}

export interface WireError {
	error: string;
	status?: number;
	retryAfter?: number;
}

function validStatus(value: unknown): number | undefined {
	return Number.isInteger(value) &&
		(value as number) >= 100 &&
		(value as number) <= 599
		? (value as number)
		: undefined;
}

/** Seconds; a numeric string is accepted because it is how `Retry-After` arrives. */
function validRetryAfter(value: unknown): number | undefined {
	const n =
		typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Adds only the fields that are present, so the wire shape stays minimal. */
function withOptional(
	base: WireError,
	status: number | undefined,
	retryAfter: number | undefined,
): WireError {
	if (status !== undefined) base.status = status;
	if (retryAfter !== undefined) base.retryAfter = retryAfter;
	return base;
}

/** Answering side: whatever the tool threw → message fields. */
export function toWireError(err: unknown): WireError {
	const message = err instanceof Error ? err.message : String(err);
	const fields = (err ?? {}) as { status?: unknown; retryAfter?: unknown };
	return withOptional(
		{ error: message },
		validStatus(fields.status),
		validRetryAfter(fields.retryAfter),
	);
}

/** Requesting side: the other window's payload is untrusted, so it is re-validated. */
export function fromWireError(data: unknown): ToolCallError {
	const fields = (data ?? {}) as Record<string, unknown>;
	const status = validStatus(fields.status);
	const retryAfter = validRetryAfter(fields.retryAfter);
	const err: ToolCallError = new Error(String(fields.error ?? "Tool failed"));
	if (status !== undefined) err.status = status;
	if (retryAfter !== undefined) err.retryAfter = retryAfter;
	return err;
}
