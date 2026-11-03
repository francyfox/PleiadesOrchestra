import { LOCALES } from "./i18n.ts";

/** The app's own icons and manifest, precached with the shell. */
export const PWA_ASSETS = [
	"/manifest.webmanifest",
	"/logo.svg",
	"/icon-192.png",
	"/icon-512.png",
	"/icon-maskable-512.png",
	"/apple-touch-icon.png",
];

const LOCALE_PREFIX = new RegExp(`^/(${LOCALES.join("|")})(?=/)`);

/**
 * What the service worker does with a same-origin path: `page` (landing or docs,
 * network first, cached for offline), `immutable` (hashed app files, cache first),
 * `asset` (the shell's icons), or `null` = not ours (playground, demos, CMS, media,
 * agent files), left to the network untouched.
 */
export function pwaRoute(
	pathname: string,
): "page" | "immutable" | "asset" | null {
	if (pathname.startsWith("/_app/immutable/")) return "immutable";
	if (PWA_ASSETS.includes(pathname)) return "asset";
	if (!pathname.endsWith("/")) return null;
	const path = pathname.replace(LOCALE_PREFIX, "");
	return path === "/" || path.startsWith("/docs/") ? "page" : null;
}
