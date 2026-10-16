---
title: Server API
---

# Server API

Endpoints for your backend, bots and scripts. They are separate from the browser-facing [Widget API](/docs/api/widget/): a browser never calls them.

## Authentication

| Endpoint | Credential |
| --- | --- |
| `POST /v1/messages`, `POST /v1/access` | `Authorization: Bearer <HARNESS_API_KEY>`: the transport secret configured on `alpha-orchestrator` (the same value as in `telegram-bot` and the CLI). |
| `POST /v1/channels/:slug/identify` | `Authorization: Bearer sk_...`: the channel's **secret key**. The transport key is not accepted here and not needed. |

A transport request with a missing or wrong key gets `401` with the body `Unauthorized`. `/health` and `/swagger` are open; the interactive API reference is at `/swagger`.

Never put `HARNESS_API_KEY` or an `sk_` key in a page or a client bundle.

## Send a message

`POST /v1/messages`: a transport (a chat bot, a CLI, your backend) sends a user's message and reads the reply as NDJSON.

| Body field | Type | Required | Notes |
| --- | --- | --- | --- |
| `threadId` | string | yes | Your own conversation id. Unique per channel and user; the first use creates the thread. |
| `userId` | string | yes | The user's id in your system, within the channel. The user is created on first use. |
| `text` | string | yes | |
| `channel` | string | no | Channel slug. Default `cli`. |
| `displayName` | string | no | Stored with the user. |

```sh
curl -N -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer $HARNESS_API_KEY" \
  -H "content-type: application/json" \
  -d '{"channel":"support-bot","threadId":"chat-17","userId":"u-42","displayName":"Aida","text":"What can you do?"}'
```

The response is `application/x-ndjson` (gzip when the request sends `accept-encoding: gzip`). The line types are the ones described in [Widget API: Stream](/docs/api/widget/#Stream): `delta`, `step`, `done`, `error`.

<!-- TODO: `POST /v1/messages` does not pass `page` or `customerContext` and has no browser to run tools, so a `tool_call` line should not be expected there. Not verified end to end. -->

| Status | Meaning |
| --- | --- |
| `200` | Stream started. |
| `401` | Wrong or missing transport key. |
| `403` | The user is not allowed (blocked, or the channel is in whitelist mode and the user is not whitelisted, or the channel is disabled). Empty body: the model is never called. |
| `404` | `Unknown channel`. |
| `422` | Body does not match the schema. |

## Check access

`POST /v1/access`: ask whether a sender may talk to the bot before you answer them. The user is created on first use.

| Body field | Type | Required |
| --- | --- | --- |
| `channel` | string | yes |
| `externalUserId` | string | yes |
| `displayName` | string | no |

```sh
curl -X POST http://localhost:3000/v1/access \
  -H "Authorization: Bearer $HARNESS_API_KEY" -H "content-type: application/json" \
  -d '{"channel":"support-bot","externalUserId":"u-42"}'
```

`200`: `{ "allowed": true, "userId": "…" }`. `404` `Unknown channel` for an unknown slug.

## Identify a visitor

`POST /v1/channels/:slug/identify`: after a visitor logs in on your site, link their anonymous widget session to your own account id. Call it from your server.

1. In the page, read the token: `await document.querySelector("pleiades-chat").getVisitorToken()`.
2. Send it to your backend, which calls identify with the channel's secret key.

| Body field | Type | Required | Notes |
| --- | --- | --- | --- |
| `visitorToken` | string | yes | From the widget. |
| `externalUserId` | string, non-empty | yes | Your account id. |

```sh
curl -X POST https://agent.example.com/v1/channels/my-shop/identify \
  -H "Authorization: Bearer $CHANNEL_SECRET_KEY" \
  -H "content-type: application/json" \
  -d '{"visitorToken":"…","externalUserId":"account-9001"}'
```

`200`: `{ "userId": "…", "merged": false }`.

- No account with that `externalUserId` yet in the channel: the anonymous user is promoted in place, `merged: false`.
- The account exists: the anonymous user's threads, messages and runs move to it in one transaction and the anonymous row is deleted, `merged: true`. A block on either side survives the merge, and so does a whitelisting.
- Repeating the same call changes nothing.

| Status | Meaning |
| --- | --- |
| `401` | Wrong secret key, or the channel is not a web channel. |
| `404` | Unknown channel slug, or unknown or expired visitor token (or a token of another channel). |
| `409` | The token is already bound to a different account. |
| `422` | Body does not match the schema. |
