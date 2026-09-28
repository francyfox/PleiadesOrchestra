import { treaty } from "@elysiajs/eden";
import type { App } from "admin-api";

/**
 * Typed client for admin-api (`/api/*`), derived from the server's route
 * types. Same origin as the panel: nginx (prod) and the Vite dev proxy send
 * `/api` to admin-api, so the session cookie needs no CORS.
 */
export function createApi(fetcher: typeof fetch = fetch) {
	return treaty<App>(window.location.origin, { fetcher }).api;
}

export type Api = ReturnType<typeof createApi>;

let shared: Api | undefined;

/** For event handlers; `load` functions should use `createApi(fetch)` with SvelteKit's own `fetch`. */
export function api(): Api {
	shared ??= createApi();
	return shared;
}
