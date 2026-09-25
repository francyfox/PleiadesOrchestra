#!/bin/sh
set -e

MODEL_PATH="${MODEL_PATH:-/models/model.gguf}"
MODEL_URL="${MODEL_URL:-https://huggingface.co/Vikhrmodels/Vikhr-Llama-3.2-1B-instruct-GGUF/resolve/main/Vikhr-Llama-3.2-1B-Q4_K_M.gguf}"

mkdir -p "$(dirname "$MODEL_PATH")"

if [ ! -f "$MODEL_PATH" ]; then
    echo "Model not found at $MODEL_PATH, downloading from $MODEL_URL"
    curl -fL --retry 10 --retry-all-errors --retry-delay 2 -C - "$MODEL_URL" -o "$MODEL_PATH.tmp"
    mv "$MODEL_PATH.tmp" "$MODEL_PATH"
else
    echo "Using cached model at $MODEL_PATH"
fi

# llama-server logs everything (including plain INFO lines) to stderr, with
# no flag to change that. Railway (and most log viewers) classify by stream,
# not content, so left alone every line shows up flagged as an error. Merge
# stderr into stdout so normal operational logs aren't misclassified.
exec /app/llama-server \
    --model "$MODEL_PATH" \
    --host 0.0.0.0 \
    --port "${PORT:-8080}" \
    --ctx-size "${CTX_SIZE:-2048}" \
    --parallel "${PARALLEL:-1}" \
    --threads "${THREADS:-2}" \
    --n-gpu-layers "${N_GPU_LAYERS:-99}" \
    --temp "${TEMP:-0.3}" \
    --api-key "$LLM_API_KEY" \
    2>&1
