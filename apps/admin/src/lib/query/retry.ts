import { ApiError } from "$lib/api/result";

const MAX_RETRIES = 1;

/**
 * Whether a failed query is asked again: not when the server gave a final
 * answer (4xx — asking again changes nothing), otherwise once, so a blip
 * doesn't show an error but a dead server doesn't hold the page for long.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
	if (error instanceof ApiError && error.status < 500) return false;
	return failureCount < MAX_RETRIES;
}
