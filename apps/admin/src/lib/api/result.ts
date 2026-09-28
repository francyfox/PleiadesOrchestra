import { error, redirect } from "@sveltejs/kit";

/** The part of an Eden Treaty reply the panel relies on. */
export interface Reply<T> {
	data: T | null;
	error: { status: unknown; value: unknown } | null;
}

/** Outcome of a form-like request; mirrors what `use:enhance` used to hand over. */
export type ActionResult =
	| { ok: true; data: Record<string, unknown> }
	| { ok: false; data: Record<string, unknown> };

function bodyOf(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

/** Only the fields the panel localizes or shows; validation dumps and the like are dropped. */
function failureData(value: unknown): Record<string, unknown> {
	const body = bodyOf(value);
	const data: Record<string, unknown> = {};
	for (const key of ["error", "message", "min", "detail"]) {
		if (body[key] !== undefined) data[key] = body[key];
	}
	return data;
}

/** Status the error page shows for a failed request: 404/503 as is, other failures as a bad gateway. */
function pageStatus(status: number): 404 | 502 | 503 {
	return status === 404 ? 404 : status === 503 ? 503 : 502;
}

/**
 * For `load`: the reply's data, or the matching error page. A lapsed session
 * (401) goes back to /login instead.
 */
export async function loaded<T>(reply: Promise<Reply<T>>): Promise<T> {
	const { data, error: failure } = await reply;
	if (failure) {
		const status = Number(failure.status);
		if (status === 401) redirect(303, "/login");
		error(
			pageStatus(status),
			String(bodyOf(failure.value).message ?? `Request failed (${status})`),
		);
	}
	return data as T;
}

/** For form handlers: never throws; failures come back as `{ ok: false, data }` for the UI to localize. */
export async function submitted<T>(
	reply: Promise<Reply<T>>,
): Promise<ActionResult> {
	try {
		const { data, error: failure } = await reply;
		if (failure) {
			if (Number(failure.status) === 401) {
				window.location.assign("/login");
			}
			return { ok: false, data: failureData(failure.value) };
		}
		return { ok: true, data: bodyOf(data) };
	} catch {
		// Network failure: no body to localize, the UI falls back to its generic "failed".
		return { ok: false, data: {} };
	}
}
