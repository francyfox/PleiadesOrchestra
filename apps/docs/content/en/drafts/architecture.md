---
title: Architecture
---

# Architecture

Every app and package of the monorepo, one line each. Internals live in each one's own `CLAUDE.md`; this file is the map, linked (not imported) from the root `CLAUDE.md` so it isn't loaded into every session. A new app or package gets a line here and its own `CLAUDE.md`.

- `packages/core` (`@repo/core`) — LLM client library, ports and the GOAP planner/executor; see `packages/core/CLAUDE.md`.
- `packages/ui` (`@repo/ui`) — the design system as CSS (tokens, fonts, Tailwind bridge) for admin and docs; see `packages/ui/CLAUDE.md`.
- `packages/tax` (`@repo/tax`) — pure order-economics math (Polar fees, payout, tax, net profit); see `packages/tax/CLAUDE.md`.
- `packages/mail-templates` (`@repo/mail-templates`) — MJML mail templates compiled at dev time, `renderMail(kind, …)` for admin-api; see `packages/mail-templates/CLAUDE.md`.
- `packages/elysia-kit` (`@repo/elysia-kit`) — shared Elysia setup (logging, Sentry, `/health`, `serve`, `retryFetch`); see `packages/elysia-kit/CLAUDE.md`.
- `packages/pleiades-widget` — framework-agnostic `<pleiades-chat>` web component; see `packages/pleiades-widget/CLAUDE.md`.
- `packages/webmcp-polyfill` — WebMCP `document.modelContext` polyfill bundled into the widget; see `packages/webmcp-polyfill/CLAUDE.md`.
- `packages/llama-runtime` — shared `llama-server` entrypoint used by `beta-text` and `delta-function-call`.
- `apps/alpha-orchestrator` — Elysia HTTP service: GOAP stream, access control, SQLite, widget and admin APIs; see `apps/alpha-orchestrator/CLAUDE.md`.
- `apps/beta-text` — `llama-server` (Vulkan) for the reply model, compose service only; see `apps/beta-text/CLAUDE.md`.
- `apps/gamma-decision` — Laya typed-decision sidecar; see `apps/gamma-decision/CLAUDE.md`.
- `apps/delta-function-call` — Qwen3-1.7B `llama-server` that fills JSON arguments for WebMCP tool calls (same image/entrypoint as `beta-text`, port 8282, compose profile `delta`); see `apps/delta-function-call/CLAUDE.md`. Each model service (beta, gamma, delta) can instead run on another machine: drop its compose profile and set its `*_BASE_URL` in the root `.env`.
- `apps/telegram-bot` — GramIO webhook adapter; see `apps/telegram-bot/CLAUDE.md`.
- `packages/wordpress-plugin` — WordPress/WooCommerce plugin (PHP, GPLv2+) that renders the widget and registers shop WebMCP tools; see `packages/wordpress-plugin/CLAUDE.md`.
- `apps/cli` (`albedo`) — thin orchestrator HTTP client; see `apps/cli/CLAUDE.md`.
- `apps/admin-api` — Elysia BFF for the admin panel; see `apps/admin-api/CLAUDE.md`.
- `apps/admin` — Svelte 5 admin SPA; see `apps/admin/CLAUDE.md`.
- `apps/docs` — SveltePress site: landing, widget playground (same-origin WebMCP demos) and the docs pages from `content/`; see `apps/docs/CLAUDE.md`.
- `apps/pleiades-mcp` — stdio MCP server exposing the orchestrator to Claude Code; see `apps/pleiades-mcp/CLAUDE.md`.
- `apps/benchmark` — every benchmark of the repo (bunli CLI: `bun tools`, `bun laya`, `bun snake`); see `apps/benchmark/CLAUDE.md`.
- `apps/e2e` — Playwright tests of the widget in a real browser (`bun run test:e2e`; `REAL_STACK=1` runs them against the live stack). Not part of `bun run test`.
- `apps/shopping-cart-webmcp` — Basketful demo shop with the widget (nested git repo, its own `package-lock.json`); a fixture, not the product. Setup in `packages/pleiades-widget/CLAUDE.md` (Integration).
- `apps/memory` — `turingdb` image only; its compose service is commented out (not wired to anything).
- `apps/gemini-webapi-mcp` — Python/uv MCP server for the Gemini web app (profile `gemini`, port 8765).
- `apps/pleiades-plugin` (WXT browser extension) is excluded from the workspace (`"!apps/pleiades-plugin"` in root `workspaces.packages`) — remove the negation when it should build with the rest.
