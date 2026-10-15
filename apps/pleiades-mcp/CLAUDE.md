# pleiades-mcp internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

Stdio MCP server (`@modelcontextprotocol/sdk`) that exposes the orchestrator to Claude Code as two read-only tools: `pleiades_list_sites` and `pleiades_site_task` (experimental; one plain-language question to a connected site's assistant, returns `{ status: "done" | "not_applicable" | "failed", answer, data? }`, falling back to browser tools on the latter two). Not a compose service.

Files (flat): `index.ts` (wiring over `StdioServerTransport`), `server.ts` (`createPleiadesServer({ sites, harness, userId })`, tool descriptions are exported constants), `harness.ts` (orchestrator client, `ask`), `sites.ts` (`parseSites`, `findSite` by slug/host/URL), `config.ts` (`buildConfig`) + `env.ts` (singleton).

## Commands and config

`bun --cwd apps/pleiades-mcp run start|test`. Env (`.env.example`): `HARNESS_BASE_URL` (default `http://localhost:3000`), `HARNESS_API_KEY`, `PLEIADES_SITES` (`slug=host,slug2=host2`, slug = orchestrator channel), `PLEIADES_MCP_USER` (external user id, default `mcp`). Each site uses thread `mcp-<slug>`.

## Gotchas

- stdout is the MCP channel — log to stderr only.
- A site not in `PLEIADES_SITES` yields `not_applicable`, never an error.
