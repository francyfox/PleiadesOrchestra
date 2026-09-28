# В отличие от apps/alpha-orchestrator, этот сервис НЕ компилируется в standalone-бинарник
# и НЕ живёт на alpine: @receptron/laya тянет onnxruntime-node — нативный
# N-API аддон с прекомпилированными .node-бинарниками под glibc. Alpine
# (musl) их не загрузит, а `bun build --compile` ненадёжно бандлит нативные
# аддоны в принципе. Поэтому здесь — обычный `bun install` + `bun run` на
# glibc-образе, без --compile.
# Built with the monorepo root as build context. `turbo prune` cuts out just this
# app and the workspaces it depends on (with a matching lockfile), so no
# Dockerfile lists workspaces by hand — a new workspace needs no change here.
FROM oven/bun:1 AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.9 prune gamma-decision --docker

FROM oven/bun:1 AS install
WORKDIR /app
# Only package.json files + the pruned lockfile: this layer (and the install)
# stays cached until a dependency actually changes.
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile

FROM install AS build
COPY --from=prune /app/out/full/ .
WORKDIR /app/apps/gamma-decision
RUN bun x tsc --noEmit

FROM oven/bun:1
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/gamma-decision
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/elysia-kit /app/packages/elysia-kit
COPY --from=build /app/apps/gamma-decision /app/apps/gamma-decision

ENV PORT=8080
ENV LAYA_API_KEY=""
ENV LAYA_MODEL_REPO="receptron/laya-onnx"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=20s --start-period=60s --retries=5 \
    CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

CMD ["bun", "src/index.ts"]
