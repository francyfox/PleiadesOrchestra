/**
 * The admin is a client-rendered SPA: the server only serves the HTML shell,
 * runs hooks (auth, locale), `+page.server.ts` loads (fetched as
 * `__data.json`) and form actions. No component renders on the server, so
 * there is nothing to hydrate.
 */
export const ssr = false;
