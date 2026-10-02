import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * One self-contained, minified script that registers <pleiades-chat>: usable
 * from a plain `<script src>`, `<script type="module">` or a bundler's
 * side-effect `import`. The size budget (10 kB, brotli — .size-limit.json)
 * is enforced by `bun run build`.
 */
export default defineConfig({
	// `src/...` imports, as tsconfig.json's `paths` (bun test reads those; Vite needs this alias).
	resolve: {
		alias: { src: fileURLToPath(new URL("./src", import.meta.url)) },
	},
	// TSX → calls of our own tiny `h` (src/components/jsx.ts), not React — read from
	// tsconfig.json's jsx/jsxFactory/jsxFragmentFactory, Vite's transformer
	// isn't esbuild here so an `esbuild: { jsx: ... }` override does nothing.
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
