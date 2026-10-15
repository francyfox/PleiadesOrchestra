# @repo/webmcp-polyfill internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

WebMCP `document.modelContext` polyfill, ported from Google's Apache-2.0 `webmcp-tools` polyfill (`LICENSE`, `NOTICE`; files carry the Google header — keep it). The original page-level IIFE is split into small composed modules; the widget calls `installWebMcpPolyfill(options)` explicitly during initialisation, so browsers without native WebMCP still work through Pleiades.

Private, license Apache-2.0 (the rest of the repo is AGPL-3.0). Public surface: `installWebMcpPolyfill`, `WebMcpPolyfillOptions`, `ToolCallError` (`src/index.ts`).

## Structure

`install.ts` (entry) -> `model-context.ts`, `registry.ts`, `provider.ts` (cross-window `postMessage` bridge; `exposeToolsTo` origin allow-list, empty = the page exposes nothing to other windows), `remote-bridge.ts`, `local-tools.ts`, `execute-tool.ts`, `declarative-forms.ts` + `observer.ts` (form-declared tools), `css-pseudo.ts`, `tool-events.ts`, `tool-error.ts`. Imports use explicit `.ts`.

Commands: `bun --cwd packages/webmcp-polyfill test`.

## Gotchas

- Consumed by `packages/pleiades-widget` as a **devDependency**: Vite bundles it into the published widget, so it must never become a runtime dependency (the widget has a 40 kB brotli budget).
- Tools registered on a page are untrusted data (the widget uses `document.modelContext` only); see the widget CLAUDE.md for the security rules.
