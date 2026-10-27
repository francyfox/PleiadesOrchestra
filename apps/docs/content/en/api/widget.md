---
title: Widget API
---

# Widget API

The browser-facing API the [`<pleiades-chat>` widget](/docs/widget/) uses. You only need this page to build your own client or to debug the widget. All paths are under `/v1/widget`.

## Authentication

| Header | Used by | Meaning |
| --- | --- | --- |
| `x-publishable-key: pk_...` | `POST /visitors` only | The channel's public key. |
| `x-visitor-token` | every other endpoint | The token returned by `POST /visitors`. |
| `Origin` | all (set by the browser) | Must be one of the channel's allowed origins. |
| `content-type: application/json` | `POST` with a body | |

The flow: get a visitor token once with the key, then send only the token. The token is stored hashed on the server and has a sliding lifetime (24 hours by default, extended on every use). A request with a missing, unknown or expired token gets `401`; the client should then create a new visitor.

None of these endpoints need the transport `HARNESS_API_KEY`; that key is for the [server API](/docs/api/server/).

### CORS

`OPTIONS /v1/widget/*` answers `204` with these headers when `Origin` belongs to a web channel, and an empty `403` otherwise:

| Header | Value |
| --- | --- |
| `access-control-allow-origin` | the request `Origin` |
| `access-control-allow-methods` | `GET, POST, OPTIONS` |
| `access-control-allow-headers` | `content-type, x-visitor-token, x-publishable-key` |
| `access-control-max-age` | `600` |

Other responses carry `access-control-allow-origin: <Origin>` and `vary: Origin` when the origin is known. When the origin is not allowed for the channel the server answers `403` **without** CORS headers, so a browser reports a network error and hides the reason.

## Endpoints

### `POST /v1/widget/visitors`

Creates an anonymous visitor.

```sh
curl -i -X POST https://agent.example.com/v1/widget/visitors \
  -H "Origin: https://shop.example" \
  -H "x-publishable-key: pk_your_channel_key"
```

`201`:

```json
{ "visitorToken": "…", "expiresAt": 1790000000000 }
```

`expiresAt` is a Unix timestamp in milliseconds.

### `POST /v1/widget/threads`

Starts a conversation for the visitor.

```sh
curl -X POST https://agent.example.com/v1/widget/threads \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN"
```

`201`: `{ "threadId": "…" }`.

### `GET /v1/widget/threads/:id/messages`

The visitor's recent history in a thread (the last 10 messages by default), oldest first. `404` if the thread is not the visitor's.

`200`:

```json
{
  "items": [
    { "id": "41", "role": "user", "content": "Find a double room", "createdAt": 1790000000000 },
    {
      "id": "42", "role": "assistant", "content": "Two rooms are free.", "createdAt": 1790000004000,
      "steps": [{ "id": "search_rooms", "phase": "done", "text": "Looking for rooms…" }]
    }
  ]
}
```

`steps` is present on a reply that used tools.

### `POST /v1/widget/messages`

Sends a message and streams the reply as NDJSON (see [Stream](#Stream)).

| Body field | Type | Required | Notes |
| --- | --- | --- | --- |
| `threadId` | string | yes | A thread of this visitor. |
| `text` | string | yes | At most `WIDGET_MAX_TEXT_CHARS` (default 2000), else `413`. |
| `replyTo` | string | no | At most 2000 characters (else `422`). The text of the assistant message the visitor answers when they pick one of its options. Models keep no chat history, so it is passed to the understanding and reply models for this message only, quoted like the message itself. |
| `clientDate` | string | no | The visitor's local date, `YYYY-MM-DD` (a real day, else `422`). Models do not know today; it becomes the turn fact `today` (the server's UTC date when absent). |
| `timeZone` | string | no | IANA zone name (`Asia/Almaty`), at most 64 characters, one the server knows (else `422`). Kept as the turn fact `timeZone`. |
| `page` | string | no | The visitor's `pathname + search`, at most 512 characters. |
| `customerContext` | object | no | Flat map of string, number or boolean values. Its JSON may not exceed the same character limit as `text`, else `413`. |

```sh
curl -N -X POST https://agent.example.com/v1/widget/messages \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"threadId":"'"$THREAD"'","text":"book a double room for Friday","page":"/rooms"}'
```

### `POST /v1/widget/tools`

Registers the tool catalog of the page for a thread. The widget calls it when the panel opens and again when the catalog changes. See [Tools](/docs/tools/).

| Body field | Type | Notes |
| --- | --- | --- |
| `threadId` | string | A thread of this visitor. |
| `webmcpTools` | array | Each item: `name` (string), optional `description` (string), optional `inputSchema` `{ type: "object", properties?, required? }`. |

The serialized `webmcpTools` may not exceed `WIDGET_MAX_WEBMCP_TOOLS_CHARS` (default 20,000), else `413`. Fields outside the schema are dropped. An empty array clears the thread's catalog. Response: `204`, no body.

```sh
curl -X POST https://agent.example.com/v1/widget/tools \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"threadId":"'"$THREAD"'","webmcpTools":[{"name":"set_pizza_size","description":"Set the pizza size.","inputSchema":{"type":"object","properties":{"size":{"type":"string","enum":["small","medium","large"]}},"required":["size"]}}]}'
```

### `POST /v1/widget/tool-results`

Answers a `tool_call` line and resumes the run. The response is a new NDJSON stream with the same line types.

| Body field | Type | Required | Notes |
| --- | --- | --- | --- |
| `threadId` | string | yes | |
| `callId` | string | yes | The `callId` of the `tool_call` line being answered. |
| `tool` | string | yes | The `tool` of that line. |
| `result` | any | yes | What the tool returned. MCP `{content:[{text}]}`, a string or JSON; its text is kept (4000 characters). |
| `isError` | boolean | no | Default `false`. |
| `page` | string | no | Where the visitor is now (a tool may have navigated). |

<!-- TODO: what a mismatched callId/tool produces on the wire (the server throws "unexpected tool result for this thread" in prepareResume; not verified whether it arrives as an `error` stream line or an HTTP status). -->

## Stream

`POST /messages` and `POST /tool-results` answer with `content-type: application/x-ndjson`: one JSON object per line. The body is gzip-compressed (`content-encoding: gzip`) when the request sends `accept-encoding: gzip`.

| `type` | Fields | Terminal? |
| --- | --- | --- |
| `delta` | `text` | no. A chunk of the reply text; append it. |
| `step` | `id`, `phase` (`running`, `done`, `failed`), `text` | no. Progress in the visitor's language. A later `step` with the same `id` replaces the earlier one. |
| `tool_call` | `tool`, `arguments`, `callId` | ends this stream. Run the tool in the browser and call `POST /tool-results`. |
| `done` | `elapsedMs`; optional `inputTokens`, `outputTokens`, `totalInputTokens`, `totalOutputTokens` | yes. The goal was reached. |
| `error` | `message`; optional `code`, `hint` | yes. |

An `error` with `code: "task_failed"` means the server worked but the site could not do the task. `hint` is the site's own last tool answer (at most 400 characters), usually advice on what to try. An `error` without a code is a fault on the server side. A dropped connection never arrives as a line; the client sees it itself.

Example:

```
{"type":"step","id":"search_rooms","phase":"running","text":"Looking for rooms…"}
{"type":"tool_call","tool":"search_rooms","arguments":{"checkIn":"2026-11-06","checkOut":"2026-11-08","guests":2},"callId":"6f1c…"}
```

The client runs `search_rooms`, then posts the result and reads the next stream:

```sh
curl -N -X POST https://agent.example.com/v1/widget/tool-results \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"threadId":"'"$THREAD"'","callId":"6f1c…","tool":"search_rooms","result":{"content":[{"type":"text","text":"- r12: double, $90/night"}]}}'
```

```
{"type":"step","id":"search_rooms","phase":"done","text":"Found rooms"}
{"type":"delta","text":"Room r12 is free."}
{"type":"done","elapsedMs":2310}
```

(The step texts above are illustrative; real texts depend on the tool and the visitor's language.)

A run can issue several `tool_call` lines one after another, each in its own stream, before `done` or `error`.

## Error statuses

Error responses have an empty body.

| Status | Where | Meaning |
| --- | --- | --- |
| `401` | all but `/visitors` | Missing, unknown or expired `x-visitor-token`. Create a new visitor. |
| `401` | `/visitors` | Unknown publishable key. |
| `403` | all | Origin not allowed, channel disabled, visitor not allowed (access mode or blocked), or IP blocked. |
| `404` | thread routes | The thread does not exist or belongs to another visitor. |
| `413` | `/messages`, `/tools`, any | Text, `customerContext` or catalog over its limit; or `Content-Length` over `WIDGET_MAX_BODY_BYTES` (default 131072) on any widget route. |
| `422` | `POST` routes | Body does not match the schema (Elysia validation). |
| `429` | see below | Rate limit. |

## Rate limits

Fixed windows, in memory, per server instance. Defaults, each set by an environment variable of `alpha-orchestrator`:

| Limit | Applies to | Default | Variable |
| --- | --- | --- | --- |
| Messages per visitor token per minute | `POST /messages`, `POST /tools` | 10 | `WIDGET_MESSAGES_PER_MINUTE` |
| Messages per client IP per minute | same | 30 | `WIDGET_IP_MESSAGES_PER_MINUTE` |
| Tool results per visitor token per minute | `POST /tool-results` | 120 | `WIDGET_TOOL_RESULTS_PER_MINUTE` |
| Threads per visitor token per hour | `POST /threads` | 30 | `WIDGET_THREADS_PER_HOUR` |
| New visitors per client IP per hour | `POST /visitors` | 20 | `WIDGET_VISITORS_PER_HOUR_PER_IP` |

`POST /tools` counts against the message limits, not the tool-result limit. The tool-result limit is separate because one request can fan out into many browser round trips (clearing a 12-line cart is 13).

The client IP comes from the socket by default (`CLIENT_IP_SOURCE`, default `socket`). Behind a proxy the operator chooses another source and how many proxy hops to trust with `TRUSTED_PROXY_HOPS` (default 1).
