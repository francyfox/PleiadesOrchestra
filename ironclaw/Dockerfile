FROM alpine:3.20

ARG IRONCLAW_VERSION=ironclaw-v1.0.0

RUN apk add --no-cache ca-certificates curl

WORKDIR /app

RUN curl -fL --retry 3 \
    "https://github.com/nearai/ironclaw/releases/download/${IRONCLAW_VERSION}/ironclaw-x86_64-unknown-linux-musl.tar.gz" \
    -o /tmp/ironclaw.tar.gz && \
    tar -xzf /tmp/ironclaw.tar.gz -C /tmp && \
    mv /tmp/ironclaw-x86_64-unknown-linux-musl/ironclaw /usr/local/bin/ironclaw && \
    rm -rf /tmp/ironclaw.tar.gz /tmp/ironclaw-x86_64-unknown-linux-musl && \
    chmod +x /usr/local/bin/ironclaw

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV PORT=3000
ENV IRONCLAW_REBORN_HOME=/data/ironclaw
ENV IRONCLAW_REBORN_PROFILE=hosted-single-tenant-volume
ENV LLM_BACKEND=openai_compatible
ENV LLM_MODEL=vikhr-llama-3.2-1b

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
