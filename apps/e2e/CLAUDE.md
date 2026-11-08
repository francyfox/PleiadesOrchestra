# e2e

Playwright tests in a real browser (system Chrome): the widget on :4310 (`server.ts`) and the docs site build on :4311 (`docs-server.ts`, built by `playwright.config.ts` with the fake agent env from `tests/playground-env.ts`). Not part of `bun run test`.

- Accessibility: `tests/a11y.spec.ts` runs axe-core (WCAG 2.2 AA tags) on the landing, playground and a docs page in light, dark and phone viewport; run with `cd apps/e2e && bunx playwright test a11y`. Fix the site, don't disable rules; exclude only third-party regions (the WebMCP demo iframe).

## WordPress

`tests/wordpress/` (needs the local site from `compose.wp.yml`, skipped when it is down; run `bunx playwright test wordpress`): `plugin/` (mount, settings), `tools/` (every plugin WebMCP tool in the browser, incl. Chrome's native WebMCP), `flows/` (widget + scripted `support/fake-agent.ts` across full page reloads; real backend not used, models are not reachable from a dev box), `support/` (`wp.ts`: site URL, skip guard, wp-cli, `tool()` caller). Details: `packages/wordpress-plugin/CLAUDE.md`.
