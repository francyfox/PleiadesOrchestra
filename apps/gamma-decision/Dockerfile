# Собирается с корнем монорепо как build context (нужен доступ к packages/core).
#
# В отличие от apps/alpha-orchestrator, этот сервис НЕ компилируется в standalone-бинарник
# и НЕ живёт на alpine: @receptron/laya тянет onnxruntime-node — нативный
# N-API аддон с прекомпилированными .node-бинарниками под glibc. Alpine
# (musl) их не загрузит, а `bun build --compile` ненадёжно бандлит нативные
# аддоны в принципе. Поэтому здесь — обычный `bun install` + `bun run` на
# glibc-образе, без --compile.
FROM oven/bun:1 AS install
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/alpha-orchestrator/package.json apps/alpha-orchestrator/package.json
COPY apps/telegram-bot/package.json apps/telegram-bot/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/gamma-decision/package.json apps/gamma-decision/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/snake-benchmark/package.json apps/snake-benchmark/package.json
COPY packages/core/package.json packages/core/package.json
RUN bun install --frozen-lockfile

FROM install AS build
COPY packages/core packages/core
COPY apps/gamma-decision apps/gamma-decision
WORKDIR /app/apps/gamma-decision
RUN bun x tsc --noEmit

FROM oven/bun:1
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/gamma-decision
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/core /app/packages/core
COPY --from=build /app/apps/gamma-decision /app/apps/gamma-decision

ENV PORT=8080
ENV LAYA_API_KEY=""
ENV LAYA_MODEL_REPO="receptron/laya-onnx"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=20s --start-period=60s --retries=5 \
    CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

CMD ["bun", "src/index.ts"]
