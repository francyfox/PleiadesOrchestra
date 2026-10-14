import type { HandleClientError } from "@sveltejs/kit/hooks";

/**
 * Unexpected errors in the browser (a route module failing to
 * load, a component throwing). SvelteKit would otherwise show the error page
 * with a generic "Internal Error", hiding the cause. Log the real error and
 * surface its text on the error page. Expected (`error(...)`) and framework
 * errors (404s) keep SvelteKit's own status and message.
 */
export const handleError: HandleClientError = ({ kind, error }) => {
	if (kind !== "unknown") return;
	console.error("[admin] client error:", error);
	if (error instanceof Error) return { message: error.message };
};
