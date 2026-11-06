# The whole stack minus the models (alpha-orchestrator, admin-api, the admin panel behind Caddy) in one image:
# ghcr.io/francyfox/pleiades. Built with the monorepo root as context. For development
# and per-service images use compose.yml and apps/*/Dockerfile.
FROM oven/bun:1.4.3-alpine AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.9 prune alpha-orchestrator admin-api admin cli --docker

FROM oven/bun:1.4.3-alpine AS install
WORKDIR /app
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile

FROM install AS build
COPY --from=prune /app/out/full/ .
RUN cd apps/alpha-orchestrator && bun x tsc --noEmit && \
    bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile /tmp/alpha-orchestrator
RUN cd apps/admin-api && bun x tsc --noEmit && \
    bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile /tmp/admin-api
# The albedo CLI (`docker exec pleiades albedo ...`): send, reset, admin:create run in here; eval needs the repo checkout.
RUN cd apps/cli && bun x tsc --noEmit && \
    bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile /tmp/albedo
# Static SPA (admin-api is only imported for types).
RUN cd apps/admin && bun run build

FROM alpine:3.20
RUN apk add --no-cache libstdc++ libgcc
COPY --from=build /tmp/alpha-orchestrator /tmp/admin-api /tmp/albedo /usr/local/bin/
# drizzle's migrator reads the SQL migrations from disk, they are not in the binaries.
COPY apps/alpha-orchestrator/drizzle /app/drizzle/alpha-orchestrator
COPY apps/admin-api/drizzle /app/drizzle/admin-api
# The panel: Caddy serves it on :80 and proxies /api to admin-api (same Caddyfile as apps/admin).
COPY --from=caddy:2.10-alpine /usr/bin/caddy /usr/bin/caddy
COPY apps/admin/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/admin/build /srv
COPY docker/pleiades/entrypoint.sh /usr/local/bin/pleiades

# One volume for everything stateful; orchestrator on 3000, admin API on 3003, panel on 80.
# The databases are here (not in the entrypoint) so `docker exec pleiades admin-api admin:create` sees them.
ENV DATABASE_PATH=/data/alpha-orchestrator/orchestrator.db \
    ADMIN_DATABASE_PATH=/data/admin/admin.db \
    HARNESS_BASE_URL=http://127.0.0.1:3000 \
    ADMIN_API_UPSTREAM=http://127.0.0.1:3003 \
    DATABASE_MIGRATIONS_DIR=/app/drizzle/alpha-orchestrator \
    ADMIN_MIGRATIONS_DIR=/app/drizzle/admin-api \
    PROVIDERS_CONFIG_PATH=/data/alpha-orchestrator/providers.toml
VOLUME /data
EXPOSE 3000 3003 80

ENTRYPOINT ["/usr/local/bin/pleiades"]
