# Gemini web-API MCP server (vendored from AndyShaman/gemini-webapi-mcp and
# hardened — see README "PleiadesOrchestra security changes"). Build context
# is the repo root, like every other service here:
#   docker build -f apps/gemini-webapi-mcp/Dockerfile .

FROM ghcr.io/astral-sh/uv:0.11.11-python3.12-trixie-slim AS build
# git: uv fetches the pinned gemini-webapi commit from GitHub.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
# Dependencies first (cached layer), strictly from uv.lock.
COPY apps/gemini-webapi-mcp/pyproject.toml apps/gemini-webapi-mcp/uv.lock apps/gemini-webapi-mcp/README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/gemini-webapi-mcp/src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim-trixie
# Unprivileged user; the only writable places are /data (volume) and /tmp.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data/cookies /data/images /data/files \
    && chown -R app:app /data && chmod 700 /data/cookies
COPY --from=build /app/.venv /app/.venv

ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    MCP_TRANSPORT=streamable-http \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8000 \
    GEMINI_FILES_DIR=/data/files \
    GEMINI_IMAGES_DIR=/data/images \
    GEMINI_COOKIE_PATH=/data/cookies

USER app
VOLUME /data
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).status == 200 else 1)"

CMD ["gemini-webapi-mcp"]
