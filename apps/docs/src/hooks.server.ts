import { createLocaleHandle } from "@sveltepress/vite/hooks";
import { ALL_LOCALES, DEFAULT_LOCALE } from "#lib/i18n.js";

// SSR `<html lang>` per locale folder (the theme only fixes it on client navigation).
// The handle reads only `lang`; label and theme stay in vite.config.ts.
const locales = Object.fromEntries(
	ALL_LOCALES.map((lang) => [
		lang === DEFAULT_LOCALE ? "/" : `/${lang}/`,
		{ lang },
	]),
) as Parameters<typeof createLocaleHandle>[0];

export const handle = createLocaleHandle(locales);
