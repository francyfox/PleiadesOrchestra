import { defineConfig } from "vite";

// The polyfill as its own ES module (dist/webmcp-polyfill.js), next to the widget's IIFE.
// A separate config: the widget build is an IIFE with one entry and would overwrite dist/.
export default defineConfig({
	build: {
		target: "es2022",
		emptyOutDir: false,
		lib: {
			entry: "src/webmcp-polyfill.ts",
			formats: ["es"],
			fileName: () => "webmcp-polyfill.js",
		},
	},
});
