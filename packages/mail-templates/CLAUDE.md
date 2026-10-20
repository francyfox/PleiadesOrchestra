# @repo/mail-templates internals

See root `CLAUDE.md` for monorepo commands and style.

HTML + plain-text mails (`verify`, `reset`, `email-change`) for `admin-api`. Runtime API, no dependencies: `renderMail(kind, { locale, link, name? }) -> { subject, html, text }`. Texts (ru, en; any other locale gets en) live in `src/index.ts`. Every value is HTML-escaped; a non-http(s) link throws `TypeError`.

Layout is MJML, compiled at dev time (`mjml` is a devDependency only): `templates/_head.mjml` (fonts; the letter is dark-only, colours inline from the admin dark theme) and `templates/_body.mjml` (wordmark, title, lead, button, raw link, footer) are shared by `templates/<kind>.mjml` through `mj-include`. All text is a `{{title|lead|button|link|footer}}` placeholder filled at runtime, so one template serves every locale.

Edit a template: change `templates/*.mjml`, run `bun --cwd packages/mail-templates run build:templates`, commit the regenerated `src/generated.ts` (excluded from Biome). A test recompiles and fails when `generated.ts` is stale. A new kind = a new `templates/<kind>.mjml` + its texts in `COPY`.

Look at them: `bun --cwd packages/mail-templates run preview` rebuilds the templates and writes every kind × ru/en to `preview/` (gitignored); open the `.html` files in a browser.

Tests: `bun --cwd packages/mail-templates test`.
