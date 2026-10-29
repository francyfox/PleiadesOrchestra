import { type IntlayerConfig, Locales } from "intlayer";

/**
 * Admin panel i18n: English (default), Russian, Kazakh.
 * @see https://intlayer.org/doc/concept/configuration
 */
const config: IntlayerConfig = {
	internationalization: {
		locales: [Locales.RUSSIAN, Locales.ENGLISH, Locales.KAZAKH],
		defaultLocale: Locales.ENGLISH,
		// Every dictionary must provide all three languages — a missing
		// translation is a type error, not a silent fallback.
		strictMode: "strict",
	},
	routing: {
		// An internal panel: no /en/… prefixes (which would also mean moving
		// every route under [[locale]] and re-checking the auth redirects).
		// The choice lives in a cookie; first visit falls back to
		// Accept-Language (see src/lib/i18n/browser-locale.ts).
		mode: "no-prefix",
		storage: "cookie",
	},
	// Visual editor (`bun run dev:editor` + `bun run editor`, http://localhost:8000): opt-in only, so a
	// build or a plain `dev` never ships it; it writes the edited texts back into the *.content.ts files.
	editor: {
		enabled: process.env.INTLAYER_EDITOR === "true",
		applicationURL: "http://localhost:3002",
	},
	dictionary: {
		importMode: "static",
	},
	build: {
		minify: true,
		purge: true,
		checkTypes: false,
	},
};

export default config;
