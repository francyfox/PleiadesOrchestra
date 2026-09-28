# force-rebuild: 2026-08-03
# Built with the monorepo root as build context. `turbo prune` cuts out just this
# app and the workspaces it depends on (with a matching lockfile), so no
# Dockerfile lists workspaces by hand — a new workspace needs no change here.
FROM oven/bun:1-alpine AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.9 prune telegram-bot --docker

FROM oven/bun:1-alpine AS install
WORKDIR /app
# Only package.json files + the pruned lockfile: this layer (and the install)
# stays cached until a dependency actually changes.
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile

FROM install AS build
COPY --from=prune /app/out/full/ .
WORKDIR /app/apps/telegram-bot
RUN bun x tsc --noEmit && \
    bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile /tmp/telegram-bot

FROM alpine:3.20
RUN apk add --no-cache libstdc++ libgcc
COPY --from=build /tmp/telegram-bot /usr/local/bin/telegram-bot

ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/telegram-bot"]
