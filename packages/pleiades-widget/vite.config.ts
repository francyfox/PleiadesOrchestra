import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { mockWidgetApi } from "./dev/mock-api.ts";

/**
 * One self-contained, minified script that registers <pleiades-chat>: usable
 * from a plain `<script src>`, `<script type="module">` or a bundler's
 * side-effect `import`. The size budget (40 kB, brotli — .size-limit.json: Alpine + the widget)
 * is enforced by `bun run build`.
 */
export default defineConfig({
	// Dev server only (`apply: "serve"`): the mock Widget API for index.html.
	plugins: [mockWidgetApi()],
	// `@/...` is `src/...`, as tsconfig.json's `paths` (bun test reads those; Vite needs this alias).
	// A regex, so scoped packages like `@alpinejs/csp` are never touched.
	resolve: {
		alias: [
			{
				find: /^@\//,
				replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/`,
			},
		],
	},
	build: {
		target: "es2022",
		// cssnano (postcss.config.js) minifies the styles.
		cssMinify: false,
		lib: {
			entry: "src/index.ts",
			name: "PleiadesWidget",
			formats: ["iife"],
			fileName: () => "pleiades-widget.js",
		},
	},
});
