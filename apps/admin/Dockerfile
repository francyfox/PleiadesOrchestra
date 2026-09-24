# Built with the monorepo root as build context (bun.lock lives there).
FROM oven/bun:1-alpine AS install
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/snake-benchmark/package.json apps/snake-benchmark/package.json
COPY apps/alpha-orchestrator/package.json apps/alpha-orchestrator/package.json
COPY apps/telegram-bot/package.json apps/telegram-bot/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/gamma-decision/package.json apps/gamma-decision/package.json
COPY packages/core/package.json packages/core/package.json
RUN bun install --frozen-lockfile

FROM install AS build
COPY apps/admin apps/admin
WORKDIR /app/apps/admin
RUN bun run build

# Everything is bundled into build/ (all deps are devDependencies on purpose),
# so the runtime image needs no node_modules — only the Bun runtime, since
# better-auth's SQLite is `bun:sqlite`.
FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=build /app/apps/admin/build ./build
COPY --from=build /app/apps/admin/drizzle ./drizzle

ENV PORT=3000 \
    ADMIN_MIGRATIONS_DIR=/app/drizzle \
    ADMIN_DATABASE_PATH=/data/admin.db
EXPOSE 3000
VOLUME /data

CMD ["bun", "./build/index.js"]
