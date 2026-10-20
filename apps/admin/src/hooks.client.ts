import * as Sentry from "@sentry/sveltekit";
import type { HandleClientError } from "@sveltejs/kit/hooks";

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		// Through admin-api (same origin): ad blockers drop requests to *.ingest.sentry.io.
		tunnel: "/api/monitoring/tunnel",
		// shortcut: every page load and /api call is traced (a low-traffic panel), lower it when the quota runs short.
		tracesSampleRate: 1,
		// The feedback button is created by feedback-widget.svelte, in the UI language.
		integrations: [
			Sentry.feedbackIntegration({
				autoInject: false,
				showBranding: false,
				// The panel's primary colour (routes/layout.css).
				themeLight: { accentBackground: "#b45309" },
				themeDark: { accentBackground: "#ffa348", accentForeground: "#262626" },
			}),
		],
	});
}

/**
 * Unexpected errors in the browser (a route module failing to
 * load, a component throwing). SvelteKit would otherwise show the error page
 * with a generic "Internal Error", hiding the cause. Log the real error and
 * surface its text on the error page. Expected (`error(...)`) and framework
 * errors (404s) keep SvelteKit's own status and message.
 */
export const handleError: HandleClientError = Sentry.handleErrorWithSentry(
	({ kind, error }) => {
		if (kind !== "unknown") return;
		console.error("[admin] client error:", error);
		if (error instanceof Error) return { message: error.message };
	},
);
