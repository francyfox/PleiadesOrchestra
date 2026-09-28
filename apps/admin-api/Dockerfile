# Built with the monorepo root as build context. `turbo prune` cuts out just this
# app and the workspaces it depends on (with a matching lockfile), so no
# Dockerfile lists workspaces by hand — a new workspace needs no change here.
FROM oven/bun:1-alpine AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.9 prune admin-api --docker

FROM oven/bun:1-alpine AS install
WORKDIR /app
# Only package.json files + the pruned lockfile: this layer (and the install)
# stays cached until a dependency actually changes.
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile

FROM install AS build
COPY --from=prune /app/out/full/ .
WORKDIR /app/apps/admin-api
RUN bun x tsc --noEmit && \
    bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile /tmp/admin-api

FROM alpine:3.20
RUN apk add --no-cache libstdc++ libgcc
COPY --from=build /tmp/admin-api /usr/local/bin/admin-api
# drizzle's migrator reads the SQL migrations from disk at startup — they are
# not embedded in the --compile binary, so they ship next to it.
COPY apps/admin-api/drizzle /app/drizzle

ENV PORT=3003 \
    ADMIN_MIGRATIONS_DIR=/app/drizzle \
    ADMIN_DATABASE_PATH=/data/admin.db
# Accounts live on a volume (compose: ./data/admin-api).
VOLUME /data
EXPOSE 3003

ENTRYPOINT ["/usr/local/bin/admin-api"]
