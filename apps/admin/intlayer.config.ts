import { type IntlayerConfig, Locales } from "intlayer";

/**
 * Admin panel i18n: Russian (default), English, Kazakh.
 * @see https://intlayer.org/doc/concept/configuration
 */
const config: IntlayerConfig = {
	internationalization: {
		locales: [Locales.RUSSIAN, Locales.ENGLISH, Locales.KAZAKH],
		defaultLocale: Locales.RUSSIAN,
		// Every dictionary must provide all three languages — a missing
		// translation is a type error, not a silent fallback.
		strictMode: "strict",
	},
	routing: {
		// An internal panel: no /en/… prefixes (which would also mean moving
		// every route under [[locale]] and re-checking the auth redirects).
		// The choice lives in a cookie; first visit falls back to
		// Accept-Language (see src/lib/server/locale.ts).
		mode: "no-prefix",
		storage: "cookie",
	},
	editor: {
		enabled: false,
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
