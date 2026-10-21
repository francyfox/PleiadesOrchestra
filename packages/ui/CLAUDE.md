# @repo/ui internals

See root `CLAUDE.md` for monorepo commands and style.

The design system as CSS, no components: edit the look of every web UI here.

- `src/tokens.css` — all custom properties (`:root` light, `.dark` on `<html>`): shadcn-named colours (`--background`, `--primary`, …, `--sidebar-*`, `--chart-*`), fonts, `--radius`, hard offset shadows, `--spacing`, gradients (`--gradient-primary|card|card-odd|sidebar|page`, shade amounts `--shade-strong|soft`), the main background photo `--page-photo` (`src/assets/autumn-leaf.webp`) and `--photo-opacity`. Plain CSS: any app imports it once globally.
- `src/tailwind.css` — Tailwind v4 bridge (`@custom-variant dark`, `@theme inline` mapping, radius/tracking scales, `bg-gradient-*` utilities). Import after `tailwindcss`.
- `src/fonts.css` — Fontsource imports (Poppins Latin 400–700, Montserrat for Cyrillic incl. Kazakh, Fira Code). Check Cyrillic + Cyrillic-ext coverage before swapping fonts.

Used by `apps/admin` (`src/routes/layout.css`: all three) and `apps/docs` (root `+layout.svelte`: tokens + fonts; `src/lib/docs-theme.css` maps SveltePress, `pleiades-site.css` maps the landing/playground). The widget (`packages/pleiades-widget/src/components/styles.css`) can't import it (40 kB budget): its tokens are copied by hand, keep them in step. Mail templates (`packages/mail-templates`) need literal hex colours, also by hand.

`url()` in `tokens.css` is relative to this file; Vite (and Tailwind's import inlining) rebases it into the app's bundle.
