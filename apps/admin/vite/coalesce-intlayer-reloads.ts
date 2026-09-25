import type { Plugin } from "vite";

/**
 * Dev-only. On any content change vite-intlayer rewrites every
 * `.intlayer/dictionary/*.json`, and Vite answers each one with its own
 * `full-reload` — 18–46 reloads within a second were measured. The tab
 * reloads mid-reload, route modules fail to load, and SvelteKit shows its
 * error page with the (successful) response status: "Error 200".
 *
 * This swallows Vite's per-file reload for `.intlayer/` files and sends one
 * `full-reload` once the burst settles. Module invalidation already happened
 * before plugin hooks run, so the single reload gets fresh dictionaries.
 */
export function coalesceIntlayerReloads({ delayMs = 300 } = {}): Plugin {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return {
		name: "pleiades:coalesce-intlayer-reloads",
		apply: "serve",
		hotUpdate({ file, server }) {
			if (!file.replaceAll("\\", "/").includes("/.intlayer/")) return;
			clearTimeout(timer);
			timer = setTimeout(
				() => server.ws.send({ type: "full-reload" }),
				delayMs,
			);
			return [];
		},
	};
}
