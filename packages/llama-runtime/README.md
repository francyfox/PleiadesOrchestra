# llama-runtime

The shared start-up script of the `llama-server` services — `apps/beta-text` (chat model) and
`apps/delta-function-call` (function-calling model). Not a JS package: each service's Dockerfile
`COPY`s `entrypoint.sh` and sets the model and tuning through environment variables (see the header
of the script). Keeping it in one place means a fix (download resume, log stream, a new flag)
reaches both services.
