# Собирается с корнем монорепо как build context (нужен доступ к packages/core).
FROM oven/bun:1-alpine AS install
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/alpha-orchestrator/package.json apps/alpha-orchestrator/package.json
COPY apps/telegram-bot/package.json apps/telegram-bot/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/gamma-decision/package.json apps/gamma-decision/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/core/package.json packages/core/package.json
RUN bun install --frozen-lockfile

FROM install AS build
COPY packages/core packages/core
COPY apps/alpha-orchestrator apps/alpha-orchestrator
WORKDIR /app/apps/alpha-orchestrator
RUN bun x tsc --noEmit && \
    bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile /tmp/alpha-orchestrator

FROM alpine:3.20
RUN apk add --no-cache libstdc++ libgcc
COPY --from=build /tmp/alpha-orchestrator /usr/local/bin/alpha-orchestrator
# drizzle's migrator reads the SQL migrations from disk at startup — they are
# not embedded in the --compile binary, so they ship next to it.
COPY apps/alpha-orchestrator/drizzle /app/drizzle

ENV PORT=3000
ENV DATABASE_MIGRATIONS_DIR=/app/drizzle
# The SQLite file lives on a volume (compose: alpha-orchestrator-data).
ENV DATABASE_PATH=/data/orchestrator.db
VOLUME /data
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/alpha-orchestrator"]
