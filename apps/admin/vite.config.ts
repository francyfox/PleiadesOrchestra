import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import adapter from "svelte-adapter-bun";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
			},
			// Bun `bun:sqlite` (better-auth's DB) only exists under the Bun runtime,
			// so the build targets a standalone Bun server.
			adapter: adapter(),
			// compose binds the panel to 127.0.0.1:3002 while ORIGIN says
			// localhost:3002 — the same panel, but different origins to the CSRF
			// check, so form actions opened via 127.0.0.1 got "Cross-site POST
			// form submissions are forbidden". Build-time only, hence hardcoded.
			csrf: {
				trustedOrigins: ["http://localhost:3002", "http://127.0.0.1:3002"],
			},
		}),
	],
	ssr: {
		// Resolved by the Bun runtime at request time, never bundled.
		external: ["bun:sqlite"],
	},
});
