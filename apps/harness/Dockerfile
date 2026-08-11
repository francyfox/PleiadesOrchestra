# Собирается с корнем монорепо как build context (нужен доступ к packages/core).
FROM oven/bun:1-alpine AS install
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/harness/package.json apps/harness/package.json
COPY apps/telegram-bot/package.json apps/telegram-bot/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY packages/core/package.json packages/core/package.json
RUN bun install --frozen-lockfile

FROM install AS build
COPY packages/core packages/core
COPY apps/harness apps/harness
WORKDIR /app/apps/harness
RUN bun x tsc --noEmit && \
    bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile /tmp/harness

FROM alpine:3.20
RUN apk add --no-cache libstdc++ libgcc
COPY --from=build /tmp/harness /usr/local/bin/harness

ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/harness"]
