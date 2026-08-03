FROM alpine:3.20 AS builder

ARG LLAMA_CPP_REF=b10236

RUN apk add --no-cache build-base cmake git linux-headers

WORKDIR /app
RUN git clone --branch "$LLAMA_CPP_REF" --depth 1 https://github.com/ggerganov/llama.cpp.git && \
    cd llama.cpp && \
    cmake -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DLLAMA_NATIVE=OFF \
        -DLLAMA_BUILD_TESTS=OFF \
        -DLLAMA_BUILD_EXAMPLES=OFF && \
    cmake --build build --config Release -j$(nproc) --target llama-server

FROM alpine:3.20

RUN apk add --no-cache libstdc++ libgcc libgomp curl

WORKDIR /app

COPY --from=builder /app/llama.cpp/build/bin/llama-server /usr/local/bin/llama-server
COPY --from=builder /app/llama.cpp/build/bin/*.so* /usr/local/lib/
RUN ldconfig /usr/local/lib || true
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Модель качается при старте контейнера (не на этапе билда), см. entrypoint.sh.
# Если в Railway подключён Volume на /models — дскачается один раз и переживёт рестарты/редеплои.
ENV PORT=8080
ENV LLM_API_KEY=""
ENV MODEL_PATH=/models/model.gguf
ENV MODEL_URL="https://huggingface.co/Vikhrmodels/Vikhr-Llama-3.2-1B-instruct-GGUF/resolve/main/Vikhr-Llama-3.2-1B-Q4_K_M.gguf"
ENV CTX_SIZE=2048
ENV THREADS=2
ENV TEMP=0.3

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
