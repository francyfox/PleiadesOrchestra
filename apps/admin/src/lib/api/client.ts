import { treaty } from "@elysiajs/eden";
import type { App } from "admin-api";
import { reportConnection } from "$lib/live/connection";
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

/** The panel's one client: query functions and event handlers both use it. */
export function api(): Api {
	shared ??= createApi();
	return shared;
}
