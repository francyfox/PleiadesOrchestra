# Playground demos

Copies of WebMCP demos from https://github.com/GoogleChromeLabs/webmcp-tools
(commit 04732fb, `demos/`), Apache-2.0 — see `LICENSE` in this directory.
Served same-origin so the playground (`/playground/` of `apps/docs`) can read
their tools in every browser.

Modifications:

- `react-flightsearch/` and `hotel-chain/` are the Vite build output (`dist/`), not sources.
- Removed the `<meta http-equiv="origin-trial">` tokens. They are bound to
  googlechromelabs.github.io; in Chrome they switch on native WebMCP, the
  polyfill then steps aside, and native tool registration in an embedded frame
  is denied — the demo ends up with zero tools.
- `shared/webmcp-polyfill.js` is not Google's file: it is built from this repo's
  `packages/webmcp-polyfill` (the polyfill the widget ships) by `bun run polyfill`
  in `apps/docs`, and git-ignored.
- Added `<script src="../shared/webmcp-polyfill.js">` to `explainer`,
  `ticket-booking`, `react-flightsearch` and `hotel-chain` (pizza-maker already
  loads it).
- Dropped the per-demo READMEs.

`basketful/` is a build of PleiadesOrchestra's `apps/shopping-cart-webmcp`
(Apache-2.0, its `LICENSE` inside), made with
`VITE_PLEIADES_URL= VITE_PLEIADES_PUBLIC_KEY= bunx --bun vite build --base /playground-demos/basketful/`
(empty widget vars so the iframe doesn't mount a second chat). Its `index.html`
also got the polyfill script plus a line that strips a trailing `/index.html`
from the URL so the router matches `/` (the dev server doesn't map a directory
to its index.html, so the playground links to the file). `_redirects`
(Netlify) was dropped. Deep links inside it 404 on reload — no SPA fallback here.
