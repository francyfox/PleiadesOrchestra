#!/bin/sh
# Shared start-up of the llama-server services (apps/beta-text, apps/delta-function-call):
# download the model once into a volume, then run llama-server with the flags below.
#
# Env (set in the service's Dockerfile / compose):
#   MODEL_URL, MODEL_PATH   where to fetch the GGUF from / where it lives (required)
#   PORT, CTX_SIZE, PARALLEL, THREADS, N_GPU_LAYERS, LLM_TEMPERATURE   llama-server tuning
#   API_KEY                 bearer key clients must send (falls back to LLM_API_KEY)
#   JINJA=1                 use the model's own chat template (needed for tools / json_schema)
set -e

MODEL_PATH="${MODEL_PATH:-/models/model.gguf}"
: "${MODEL_URL:?set MODEL_URL to a GGUF download URL}"
API_KEY="${API_KEY:-${LLM_API_KEY:-}}"

mkdir -p "$(dirname "$MODEL_PATH")"

if [ ! -f "$MODEL_PATH" ]; then
    echo "Model not found at $MODEL_PATH, downloading from $MODEL_URL"
    curl -fL --retry 10 --retry-all-errors --retry-delay 2 -C - "$MODEL_URL" -o "$MODEL_PATH.tmp"
    mv "$MODEL_PATH.tmp" "$MODEL_PATH"
else
    echo "Using cached model at $MODEL_PATH"
fi

set -- \
    --model "$MODEL_PATH" \
    --host 0.0.0.0 \
    --port "${PORT:-8080}" \
    --ctx-size "${CTX_SIZE:-2048}" \
    --parallel "${PARALLEL:-1}" \
    --threads "${THREADS:-2}" \
    --n-gpu-layers "${N_GPU_LAYERS:-99}" \
    --temp "${LLM_TEMPERATURE:-0.3}" \
    --api-key "$API_KEY"
if [ "${JINJA:-0}" = "1" ]; then
    set -- "$@" --jinja
fi

# llama-server logs everything (including plain INFO lines) to stderr, with
# no flag to change that. Log viewers classify by stream, not content, so left
# alone every line shows up flagged as an error. Merge stderr into stdout so
# normal operational logs aren't misclassified.
exec /app/llama-server "$@" 2>&1
