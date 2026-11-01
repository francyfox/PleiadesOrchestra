# The whole stack minus the models (alpha-orchestrator + admin-api) in one image:
# ghcr.io/francyfox/pleiades. Built with the monorepo root as context. For development
# and per-service images use compose.yml and apps/*/Dockerfile.
FROM oven/bun:1.4.3-alpine AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.9 prune alpha-orchestrator admin-api --docker

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

FROM alpine:3.20
RUN apk add --no-cache libstdc++ libgcc
COPY --from=build /tmp/alpha-orchestrator /tmp/admin-api /usr/local/bin/
# drizzle's migrator reads the SQL migrations from disk, they are not in the binaries.
COPY apps/alpha-orchestrator/drizzle /app/drizzle/alpha-orchestrator
COPY apps/admin-api/drizzle /app/drizzle/admin-api
COPY docker/pleiades/entrypoint.sh /usr/local/bin/pleiades

# One volume for everything stateful; orchestrator on 3000, admin API on 3003.
ENV DATABASE_MIGRATIONS_DIR=/app/drizzle/alpha-orchestrator \
    ADMIN_MIGRATIONS_DIR=/app/drizzle/admin-api \
    PROVIDERS_CONFIG_PATH=/data/alpha-orchestrator/providers.toml
VOLUME /data
EXPOSE 3000 3003

ENTRYPOINT ["/usr/local/bin/pleiades"]
