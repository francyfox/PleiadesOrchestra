# Собирается с корнем монорепо как build context (нужен доступ к packages/core).
FROM oven/bun:1-alpine AS install
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/telegram-bot/package.json apps/telegram-bot/package.json
COPY packages/core/package.json packages/core/package.json
RUN bun install --frozen-lockfile

FROM install AS build
COPY packages/core packages/core
COPY apps/telegram-bot apps/telegram-bot
WORKDIR /app/apps/telegram-bot
RUN bun x tsc --noEmit && \
    bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile /tmp/telegram-bot

FROM alpine:3.20
RUN apk add --no-cache libstdc++ libgcc
COPY --from=build /tmp/telegram-bot /usr/local/bin/telegram-bot

ENTRYPOINT ["/usr/local/bin/telegram-bot"]
