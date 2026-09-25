import type { HandleClientError } from "@sveltejs/kit";

/**
 * Unexpected errors in the browser (a route module failing to
 * load, a component throwing). SvelteKit would otherwise show the error page
 * with the *response's* status — 200 — and a generic message, hiding the
 * cause. Log the real error and surface its text on the error page.
 */
export const handleError: HandleClientError = ({ error, status, message }) => {
	console.error(`[admin] client error (status ${status}):`, error);
	return {
		message: error instanceof Error ? error.message : message,
	};
};
