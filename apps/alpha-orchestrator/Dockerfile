# Built with the monorepo root as build context. `turbo prune` cuts out just this
# app and the workspaces it depends on (with a matching lockfile), so no
# Dockerfile lists workspaces by hand — a new workspace needs no change here.
# The translator's native half (SentencePiece + CTranslate2 + a flat C API for
# bun:ffi), built on Alpine so it matches the musl `--compile` binary below.
# Its own stage: only native/ is copied in, so it is rebuilt when the C++ or
# build script changes, not when TypeScript does (CTranslate2 takes minutes).
FROM alpine:3.20 AS native
RUN apk add --no-cache build-base cmake git linux-headers libgomp
WORKDIR /src
COPY apps/alpha-orchestrator/native /src/native
# Compiling CTranslate2 on every core froze a 12-core desktop for ~10 minutes:
# a few jobs at the lowest priority keep the machine usable (slower, once).
ARG NATIVE_JOBS=4
RUN PREFIX=/opt/translator JOBS=$NATIVE_JOBS nice -n 19 /src/native/build.sh

FROM oven/bun:1-alpine AS prune
WORKDIR /app
COPY . .
RUN bunx turbo@2.10.9 prune alpha-orchestrator --docker

FROM oven/bun:1-alpine AS install
WORKDIR /app
# Only package.json files + the pruned lockfile: this layer (and the install)
# stays cached until a dependency actually changes.
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile

FROM install AS build
COPY --from=prune /app/out/full/ .
WORKDIR /app/apps/alpha-orchestrator
RUN bun x tsc --noEmit && \
    bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile /tmp/alpha-orchestrator

FROM alpine:3.20
RUN apk add --no-cache libstdc++ libgcc libgomp
COPY --from=build /tmp/alpha-orchestrator /usr/local/bin/alpha-orchestrator
# libtranslator.so + its CTranslate2/SentencePiece libraries (rpath $ORIGIN).
COPY --from=native /opt/translator/lib/*.so* /opt/translator/lib/
# drizzle's migrator reads the SQL migrations from disk at startup — they are
# not embedded in the --compile binary, so they ship next to it.
COPY apps/alpha-orchestrator/drizzle /app/drizzle

ENV PORT=3000
ENV DATABASE_MIGRATIONS_DIR=/app/drizzle
# The SQLite file lives on a volume (compose: alpha-orchestrator-data).
ENV DATABASE_PATH=/data/orchestrator.db
VOLUME /data
# Messages are translated to English as they come in (Opus-MT, ~40 ms). The
# model (~150 MB) downloads into this volume on first start; clear
# TRANSLATE_LIB_PATH to run without translation.
ENV TRANSLATE_LIB_PATH=/opt/translator/lib/libtranslator.so
ENV TRANSLATE_MODEL_DIR=/models/opus-ru-en
VOLUME /models
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/alpha-orchestrator"]
