# Delta — the function-calling model of PleiadesOrchestra: fills in the arguments of a tool call
# (see packages/core `FunctionCallAgent`). Same llama.cpp build as beta-text, other model.
FROM ghcr.io/ggml-org/llama.cpp:server-vulkan-b11176

WORKDIR /app

COPY packages/llama-runtime/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# The model downloads on first start into the /models volume (compose.yml).
# Picked by apps/tools-benchmark; change MODEL_URL to switch (any GGUF with a chat template).
ENV PORT=8080
ENV MODEL_PATH=/models/model.gguf
ENV MODEL_URL="https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf"
# One short prompt (tool schema + facts + last answer) per call — no long context needed.
ENV CTX_SIZE=4096
ENV PARALLEL=1
ENV THREADS=2
ENV N_GPU_LAYERS=99
# Arguments must be reproducible.
ENV LLM_TEMPERATURE=0
# The model's own chat template; required for json_schema-constrained output with Qwen3/xLAM-style models.
ENV JINJA=1
ENV API_KEY=""

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=20s --start-period=60s --retries=5 \
    CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
