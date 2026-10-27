---
title: Intro
---

# PleiadesOrchestra

PleiadesOrchestra is a set of small services that let a chat assistant operate a website with **small local models** instead of one large hosted model. A GOAP planner (goal-oriented action planning) decides what to do; the models only do narrow jobs: classify a message, fill in a tool's arguments, write a short reply.

It is not built for one kind of site. A shop, a hotel booking form, a pizza builder or a ticket desk all work the same way: the site describes what it can do, and the orchestrator plans around that description.

## How it works

1. The site embeds the [`<pleiades-chat>` widget](/docs/widget/).
2. The site registers its own tools in the browser with WebMCP (`document.modelContext.registerTool`). A tool is a name, a description and a JSON schema. See [Tools](/docs/tools/).
3. When the panel opens, the widget sends the tool catalog to the orchestrator (`POST /v1/widget/tools`). See the [Widget API](/docs/api/widget/).
4. A visitor writes a message. The orchestrator works out what the visitor wants, plans a sequence of tool calls, and streams progress back as NDJSON.
5. Tools run **in the visitor's browser**. When the plan needs one, the stream ends with a `tool_call` line; the widget runs the tool on the page and posts the result back, and the run resumes.

The orchestrator never sees the site's code or database, only tool names, schemas, and what the tools answer.

## Services

| Service | Role |
| --- | --- |
| `alpha-orchestrator` | HTTP service. Holds channels, visitors, threads and history (SQLite), runs the GOAP planner and streams replies. The widget API and the server API are documented here. |
| `beta-text` | A `llama-server` with a small reply model. Writes the conversational answer. |
| `gamma-decision` (Laya) | Typed-decision sidecar. Answers choice and score questions with calibrated probabilities; never writes text. Used for intent classification and for choosing among a tool's options. |
| `delta-function-call` | A small `llama-server` that fills the JSON arguments of a tool call from the visitor's message and the tool's schema. |
| alpha-understand | Not a separate service: one call of a language model from `alpha-orchestrator` per message. It writes the message in English, splits it into tasks and marks how many of each product; the decision and function-call models read English only. |

Each model service can run on the same machine or elsewhere; `alpha-orchestrator` reaches it by base URL.

## Pages

- [Widget](/docs/widget/): install and configure `<pleiades-chat>`.
- [Tools](/docs/tools/): how a site exposes tools with WebMCP.
- [Widget API](/docs/api/widget/): the REST and NDJSON API the widget uses.
- [Server API](/docs/api/server/): server-to-server endpoints.
- [Intents](/docs/intents/): how a message is classified, and what is planned.

<!-- TODO: link targets assume the SveltePress site serves content/<path>.md at /<path> and content/<dir>/index.md at /<dir>/; adjust if the router differs. -->
