export const DAY_MS = 24 * 60 * 60 * 1000;

export interface ServerLike {
	requestIP(request: Request): { address: string } | null;
}

/** A JSON response that also carries better-auth's `Set-Cookie` headers (several: session token + data). */
export function withCookies(
	body: unknown,
	source: Headers,
	status = 200,
): Response {
	const headers = new Headers({ "content-type": "application/json" });
	for (const cookie of source.getSetCookie())
		headers.append("set-cookie", cookie);
	return new Response(body === null ? null : JSON.stringify(body), {
		status,
		headers,
	});
}

/** The 429 for a locked IP/account: stable code, `Retry-After` header and body field. */
export function tooManyAttempts(retryAfter: number): Response {
	return new Response(
		JSON.stringify({ error: "too_many_attempts", retryAfter }),
		{
			status: 429,
			headers: {
				"content-type": "application/json",
				"retry-after": String(retryAfter),
			},
		},
	);
}
