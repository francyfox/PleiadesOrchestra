import { treaty } from "@elysiajs/eden";
import type { App } from "admin-api";
import { reportConnection } from "#lib/live/connection.js";
import { withConnectionReport } from "./report-connection";

/**
 * Typed client for admin-api (`/api/*`), derived from the server's route
 * types. Same origin as the panel: nginx (prod) and the Vite dev proxy send
 * `/api` to admin-api, so the session cookie needs no CORS.
 */
export function createApi(fetcher: typeof fetch = fetch) {
	return treaty<App>(window.location.origin, {
		fetcher: withConnectionReport(fetcher, reportConnection),
	}).api;
}

export type Api = ReturnType<typeof createApi>;

let shared: Api | undefined;
let scoped: Api | undefined;

/** The panel's one client: query functions and event handlers both use it. */
export function api(): Api {
	if (scoped) return scoped;
	shared ??= createApi();
	return shared;
}

/**
 * Runs `run` with `api()` answering a client on `fetcher` — `load`'s own
 * `fetch`, which SvelteKit wants instead of `window.fetch`. Query functions
 * call `api()` synchronously, before their first `await`, so the swap covers
 * exactly the request they start.
 */
export function withFetch<T>(fetcher: typeof fetch, run: () => T): T {
	const previous = scoped;
	scoped = createApi(fetcher);
	try {
		return run();
	} finally {
		scoped = previous;
	}
}
