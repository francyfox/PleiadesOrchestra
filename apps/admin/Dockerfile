# Built with the monorepo root as build context. `turbo prune` cuts out just this
# app and the workspaces it depends on (with a matching lockfile), so no
# Dockerfile lists workspaces by hand — a new workspace needs no change here.
FROM oven/bun:1-alpine AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.9 prune admin --docker

FROM oven/bun:1-alpine AS install
WORKDIR /app
# Only package.json files + the pruned lockfile: this layer (and the install)
# stays cached until a dependency actually changes.
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile

FROM install AS build
COPY --from=prune /app/out/full/ .
WORKDIR /app/apps/admin
# Static SPA: build/ is plain files. admin-api is only imported for types,
# which the bundler erases, so its sources are not needed here.
RUN bun run build

# No application server at runtime — Caddy serves the files and proxies /api.
FROM caddy:2.10-alpine
COPY apps/admin/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/admin/build /srv

# Where /api is proxied to (read by the Caddyfile).
ENV ADMIN_API_UPSTREAM=http://admin-api:3003
EXPOSE 80
