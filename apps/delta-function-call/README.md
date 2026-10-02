# Delta Function Call

The function-calling model of [PleiadesOrchestra](../../README.md).

A `llama-server` (llama.cpp, Vulkan build, the same image and start-up script as
[beta-text](../beta-text/README.md)) serving a small English function-calling model. The
orchestrator asks it one thing: given a tool's JSON schema, the user's request (translated to
English by beta-text), the facts the plan already knows and the last tool answer, return the
arguments of the call — as JSON constrained to the schema. Which tool to call and in what order is
still decided by the GOAP planner.

In the orchestrator it is `packages/core`'s `FunctionCallAgent` (`createFunctionCallAgent`), called
from the WebMCP tool actions. It is optional: without `FUNCTION_CALL_BASE_URL` (or when a call fails)
the arguments are built from the run's facts. Env of the orchestrator: `FUNCTION_CALL_BASE_URL`
(`http://delta-function-call:8080/v1` in compose), `FUNCTION_CALL_API_KEY` (same as the compose
`FUNCTION_CALL_API_KEY` here), `FUNCTION_CALL_MODEL`, `FUNCTION_CALL_MAX_CONCURRENCY` (1).

The model is chosen with [`apps/tools-benchmark`](../tools-benchmark); change `MODEL_URL` in the
Dockerfile (or the compose environment) to switch.
