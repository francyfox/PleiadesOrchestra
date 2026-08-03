#!/bin/sh
set -e

MODEL_PATH="${MODEL_PATH:-/models/model.gguf}"
MODEL_URL="${MODEL_URL:-https://huggingface.co/Vikhrmodels/Vikhr-Llama-3.2-1B-instruct-GGUF/resolve/main/Vikhr-Llama-3.2-1B-Q4_K_M.gguf}"

mkdir -p "$(dirname "$MODEL_PATH")"

if [ ! -f "$MODEL_PATH" ]; then
    echo "Model not found at $MODEL_PATH, downloading from $MODEL_URL"
    curl -fL --retry 3 "$MODEL_URL" -o "$MODEL_PATH.tmp"
    mv "$MODEL_PATH.tmp" "$MODEL_PATH"
else
    echo "Using cached model at $MODEL_PATH"
fi

exec llama-server \
    --model "$MODEL_PATH" \
    --host 0.0.0.0 \
    --port "${PORT:-8080}" \
    --ctx-size "${CTX_SIZE:-2048}" \
    --parallel "${PARALLEL:-1}" \
    --threads "${THREADS:-2}" \
    --temp "${TEMP:-0.3}" \
    --api-key "$LLM_API_KEY"
