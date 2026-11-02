# e2e

Playwright tests in a real browser (system Chrome): the widget on :4310 (`server.ts`) and the docs site build on :4311 (`docs-server.ts`, built by `playwright.config.ts` with the fake agent env from `tests/playground-env.ts`). Not part of `bun run test`.

- Accessibility: `tests/a11y.spec.ts` runs axe-core (WCAG 2.2 AA tags) on the landing, playground and a docs page in light, dark and phone viewport; run with `cd apps/e2e && bunx playwright test a11y`. Fix the site, don't disable rules; exclude only third-party regions (the WebMCP demo iframe).
