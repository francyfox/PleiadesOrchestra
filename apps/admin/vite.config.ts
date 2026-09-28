import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { intlayer } from "vite-intlayer";
import { coalesceIntlayerReloads } from "./vite/coalesce-intlayer-reloads";
import { devApiProxy } from "./vite/dev-api-proxy";

/** Where the dev server sends `/api` — apps/admin-api (`bun --cwd apps/admin-api run dev`). */
const ADMIN_API = process.env.ADMIN_API_URL ?? "http://localhost:3003";

export default defineConfig({
	// intlayer() must come before sveltekit() (vite-intlayer docs).
	plugins: [
		// Same-origin /api in dev too, so the session cookie behaves as in prod.
		// First: intlayer() and sveltekit() would otherwise see (and 404) /api first.
		devApiProxy(ADMIN_API),
		tailwindcss(),
		intlayer(),
		// Dev: one reload per dictionary rebuild instead of one per JSON file.
		coalesceIntlayerReloads(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
			},
			// A static SPA: every route falls back to index.html, which boots the
			// client router. Served by nginx in Docker (see nginx.conf), which also
			// proxies /api to admin-api.
			adapter: adapter({ fallback: "index.html" }),
		}),
	],
});
