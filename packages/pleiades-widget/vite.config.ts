import { defineConfig } from "vite";

/**
 * One self-contained, minified script that registers <pleiades-chat>: usable
 * from a plain `<script src>`, `<script type="module">` or a bundler's
 * side-effect `import`. The size budget (10 kB, brotli — .size-limit.json)
 * is enforced by `bun run build`.
 */
export default defineConfig({
	// TSX is compiled to calls of our own tiny `h` (src/ui/jsx.ts), not React.
	esbuild: { jsx: "transform", jsxFactory: "h", jsxFragment: "Fragment" },
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
