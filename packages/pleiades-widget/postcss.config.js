// Vite runs this on every stylesheet. `postcss-nested` lets styles/ be written
// with nesting; `cssnano` does the minifying (so `build.cssMinify` is off).
export default {
	plugins: {
		"postcss-nested": {},
		cssnano: { preset: "default" },
	},
};
