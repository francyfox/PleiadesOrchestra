# HTTP-контракт `alpha-orchestrator` для админки и транспортов

Источник правды для параллельной разработки `apps/alpha-orchestrator` (сервер),
`apps/admin-api` (клиент; он же BFF для панели) и `apps/telegram-bot`/`apps/cli` (клиенты). Дизайн и мотивация —
`docs/sessions-and-admin-plan.md`. Меняете контракт — меняйте этот файл в том же PR.

Панель `apps/admin` этот API напрямую не вызывает: это статический SPA, он ходит в `apps/admin-api`
(`/api/*`, Elysia, Swagger UI на `/api/docs`), а тот — сюда, под ключом `ADMIN_API_KEY` и с
`X-Admin-Id` из сессии администратора. Контракт панель ↔ `admin-api` описан TypeBox-схемами в
`apps/admin-api/src/schemas/` и документируется Swagger'ом; DTO ниже — те же, что там.

Общие правила:

- Все времена — epoch ms (`number`).
- JSON, `content-type: application/json`, кроме NDJSON-стрима `/v1/messages`.
- Ошибки — любой не-2xx; тело не является частью контракта (клиенты делают `!response.ok`).
- Идентификаторы — строки.

## Транспортный API (`Authorization: Bearer <HARNESS_API_KEY>`)

### `POST /v1/access`

Регистрирует пользователя канала (если его ещё нет), обновляет `lastSeenAt`/`displayName`,
отвечает, допущен ли он. Текст сообщения сюда не передаётся.

```json
// запрос
{ "channel": "telegram", "externalUserId": "123456", "displayName": "Ivan" }
// ответ 200
{ "allowed": true, "userId": "<наш uuid>" }
```

`channel` — slug существующего канала; неизвестный slug → `404`. `displayName` опционален.

### `POST /v1/messages` (изменение)

```json
{ "threadId": "t1", "userId": "<externalUserId>", "text": "...", "channel": "telegram", "displayName": "Ivan" }
```

- `channel` опционален, по умолчанию `"cli"`. `displayName` опционален.
- `userId` в теле — **внешний** id пользователя в канале (как и раньше).
- Пользователь не допущен (канал отключён / заблокирован / не в белом списке канала с
  `accessMode = "whitelist"`) → `403` с пустым телом, модель не вызывается.
- Неизвестный `channel` → `404`.
- NDJSON-события прежние; в `done` добавлены опциональные `totalInputTokens`/`totalOutputTokens`.

`POST /v1/threads/:id/reset` — контракт прежний (`204`), добавлен опциональный query
`?channel=<slug>`. Треды теперь хранятся на пользователя, поэтому внешний id может соответствовать
нескольким внутренним тредам; без `?channel=` сбрасываются все совпавшие. Неизвестный id — тоже
`204` (сбрасывать нечего).

`POST /v1/decisions` не меняется.

## Admin API (`Authorization: Bearer <ADMIN_API_KEY>`)

Всё под `/v1/admin/*`. Мутирующие запросы (POST/PATCH/DELETE) обязаны передавать
`X-Admin-Id: <id администратора из better-auth>`, без него → `400`. `HARNESS_API_KEY` к
`/v1/admin/*` доступа не даёт (→ `401`), и наоборот.

### Типы

```ts
type UserStatus = "allowed" | "pending" | "blocked";
// blocked  — blockedAt != null (сильнее всего)
// pending  — канал в режиме "whitelist" и whitelistedAt == null
// allowed  — иначе
// Отключённый канал на статус пользователя не влияет (виден в channel.disabledAt).

interface ChannelRef { id: string; slug: string; name: string; kind: "telegram" | "cli" | "web" }

interface UsageTotals {
  inputTokens: number;        // сумма по вызовам, где провайдер сообщил usage
  outputTokens: number;
  calls: number;
  callsWithoutUsage: number;  // вызовы без usage — не входят в суммы выше
}

interface AdminUser {
  id: string;
  channel: ChannelRef;
  kind: "identified" | "anonymous";
  externalUserId: string | null;
  displayName: string | null;
  status: UserStatus;
  whitelistedAt: number | null;
  whitelistedBy: string | null;   // id администратора
  blockedAt: number | null;
  blockedReason: string | null;
  blockedBy: string | null;
  createdAt: number;
  lastSeenAt: number;
  ip: string | null;              // IP последнего запроса виджета, открытым текстом; null — неизвестен (Telegram/CLI, старые записи)
  usage: UsageTotals;             // за период from/to запроса, по умолчанию — за всё время
}

interface AdminMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  planRunId: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; latencyMs: number } | null; // только у assistant
  // usage = сумма всех вызовов модели GOAP-прогона этого ответа (ingest + генерация).
  // inputTokens/outputTokens = null, если хоть один вызов не сообщил usage (частичная сумма занижала бы).
  // usage = null, если у ответа нет прогона или по нему нет вызовов.
}

interface Channel extends ChannelRef {
  accessMode: "whitelist" | "open";
  allowedOrigins: string[];
  publishableKey: string | null;
  disabledAt: number | null;
  createdAt: number;
}
```

### Пользователи

`GET /v1/admin/users`

Query: `channel` (slug), `kind`, `status`, `q` (поиск по displayName/externalUserId),
`sort` = `lastSeenAt` | `createdAt` | `tokens` (по умолчанию `lastSeenAt`), `order` = `asc` | `desc`
(по умолчанию `desc`), `from`/`to` (период для `usage`), `cursor`, `limit` (1–200, по умолчанию 50).

```json
{ "items": [AdminUser], "nextCursor": "opaque" | null, "total": 123 }
```

Невалидный query (неизвестное значение enum и т.п.) → `422`.

`cursor` — непрозрачная строка, клиент передаёт её как есть. `total` — число пользователей,
подходящих под фильтры.

`GET /v1/admin/users/:id` →

```json
{
  "user": AdminUser,
  "messages": [AdminMessage],          // последние ≤10, от старых к новым
  "usageByDay": [{ "day": "2026-09-24", "inputTokens": 0, "outputTokens": 0, "calls": 0, "callsWithoutUsage": 0 }],
  "usageByModel": [{ "model": "vikhr-llama-3.2-1b", "kind": "generate", "inputTokens": 0, "outputTokens": 0, "calls": 0, "callsWithoutUsage": 0, "avgLatencyMs": 0 }]
}
```

`usageByDay` — последние 30 дней (UTC), дни без вызовов опускаются.

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/v1/admin/users/:id/whitelist` | — | `{ "user": AdminUser }` |
| POST | `/v1/admin/users/:id/unwhitelist` | — | `{ "user": AdminUser }` |
| POST | `/v1/admin/users/:id/block` | `{ "reason": "..." }` (опц.) | `{ "user": AdminUser }` |
| POST | `/v1/admin/users/:id/unblock` | — | `{ "user": AdminUser }` |
| POST | `/v1/admin/users/bulk` | `{ "ids": [..], "action": "whitelist"\|"unwhitelist"\|"block"\|"unblock", "reason"?: "..." }` | `{ "updated": 3 }` |
| DELETE | `/v1/admin/users/:id/messages` | — | `204` |

Неизвестный `:id` → `404`.

### Расход

`GET /v1/admin/usage?groupBy=day|user|channel|model&from&to&channel`

```json
{ "rows": [{ "key": "2026-09-24", "label": "2026-09-24", "inputTokens": 0, "outputTokens": 0, "calls": 0, "callsWithoutUsage": 0, "avgLatencyMs": 0 }] }
```

`key` — день (`YYYY-MM-DD`, UTC) / user id / channel slug / model. `label` — человекочитаемое
(для user — displayName или externalUserId, для удалённых анонимов — `"(удалён)"`, key `null`).
По умолчанию `from` = 30 дней назад, `to` = сейчас.

`GET /v1/admin/stats` →

```json
{ "users": { "total": 0, "pending": 0, "blocked": 0, "anonymous": 0 },
  "usage": { "today": UsageTotals, "last7d": UsageTotals, "last30d": UsageTotals } }
```

### Производительность

`GET /v1/admin/performance?from&to` (по умолчанию последние 30 дней) — задержки вызовов моделей
из журнала `llm_calls`:

```json
{
  "rows":    [{ "day": "2026-09-24", "kind": "generate", "calls": 3, "failed": 1, "p50": 4000, "p90": 9000, "p99": 9000, "max": 9000, "tokensPerSecond": 37.5 }],
  "overall": [{ "kind": "generate", "calls": 3, "failed": 1, "p50": 4000, "p90": 9000, "p99": 9000, "max": 9000, "tokensPerSecond": 37.5 }]
}
```

- `rows` — по дням (UTC) × `kind` (`ingest` / `generate` / `decision`), `overall` — по `kind` за весь период.
- Перцентили — nearest-rank по `latencyMs` всех вызовов, включая упавшие (`failed` — их число).
- `tokensPerSecond` — медиана `outputTokens / latency` по успешным вызовам с usage; `null`, если
  таких нет (у Laya токенов нет).

### GOAP

`GET /v1/admin/runs/:id` →

```json
{
  "run": { "id": "", "userId": "", "threadId": "", "goal": {}, "succeeded": true, "attempts": 1, "durationMs": 0, "createdAt": 0 },
  "events": [{ "seq": 0, "type": "planned", "attempt": 0, "action": null, "payload": {}, "at": 0 }],
  "llmCalls": [{ "actionName": "generateReply", "kind": "generate", "model": "", "inputTokens": 0, "outputTokens": 0, "latencyMs": 0, "ok": true, "at": 0 }]
}
```

`events[].type` и поля `payload` — ровно `PlanTraceEvent` из `@repo/core`
(`packages/core/src/goap/types.ts`) без полей `type`/`attempt`/`action`/`at`, вынесенных на
верхний уровень. Длинные строки в `state` обрезаны до 500 символов. У события `finished` нет
`attempt` — в колонку `attempt` кладётся его `attempts`.

`GET /v1/admin/goap/actions` →

```json
{ "actions": [{ "name": "generateReply", "cost": 5, "preconditions": {}, "effects": { "replied": true } }] }
```

### Каналы

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/v1/admin/channels?page=&pageSize=` | — | `{ "items": [Channel], "total": 3 }` |
| POST | `/v1/admin/channels` | `{ "slug", "name", "kind": "web", "accessMode", "allowedOrigins": [] }` | `{ "channel": Channel, "secretKey": "..." }` |
| PATCH | `/v1/admin/channels/:id` | `{ "name"?, "accessMode"?, "allowedOrigins"?, "disabled"?: boolean }` | `{ "channel": Channel }` |
| POST | `/v1/admin/channels/:id/rotate-keys` | — | `{ "channel": Channel, "secretKey": "..." }` |

`secretKey` возвращается только в этих двух ответах — хранится хешем. Через API создаются только
`kind: "web"`; `telegram`/`cli` создаются миграцией. `slug` — `^[a-z0-9][a-z0-9-]*$`, до 64
символов; занятый `slug` → `409`. `rotate-keys` меняет и `publishableKey`, и `secretKey`.
В PATCH пропущенные поля не меняются.

Постраничность (`GET /v1/admin/channels`, `GET /v1/admin/blocked-ips`): `pageSize` 1…100, `page` ≥ 1
(по умолчанию 1). Без `pageSize` возвращается весь список (`page` игнорируется). `total` — полное
число записей, не зависящее от страницы; страница за пределами списка → `items: []`. Порядок
детерминирован: каналы — по `createdAt` (старые первыми), затем по `id`; блокировки — новые первыми.

Каналы — не только «сайт»: это любая точка входа (telegram, discord, slack, cli, jira, виджет
на сайте…). `kind: "web"` — единственный вид, который создаётся через API и у которого есть
ключи виджета и `allowedOrigins`.

### Блокировки по IP

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/v1/admin/blocked-ips?page=&pageSize=` | — | `{ "items": [BlockedIp], "total": 1 }` |
| POST | `/v1/admin/blocked-ips` | `{ "ip": "1.2.3.4", "channelId"?: "...", "reason": "...", "expiresInHours": 24 }` | `{ "item": {...} }` |
| DELETE | `/v1/admin/blocked-ips/:id` | — | `204` |

`BlockedIp` = `{ "id", "ipHash", "ip": "1.2.3.4" | null, "channelId": null, "reason", "createdAt", "expiresAt" }`.

**Хеш или IP.** Совпадение блокировки всегда идёт по `ipHash` = `sha256(IP_HASH_SALT:ip)`. Открытый
IP хранится дополнительно и только для админки (показать, найти по whois): `blocked_ips.ip`
(`null` у записей, созданных до этого поля) и `users.last_ip`. `expiresInHours` обязателен (> 0):
IP бывают общими, бессрочная блокировка недопустима. Анонимные
пользователи (вместе с `last_ip`) удаляются после `ANON_RETENTION_HOURS` неактивности; у
identified-пользователя `last_ip` остаётся, пока существует пользователь. Неизвестный
`channelId` → `404`.

### Агенты

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/v1/admin/agents` | — | `{ "items": [Agent] }` |

```ts
interface Agent {
  id: string;                    // "beta-text" | "gamma-decision"
  name: string;
  role: "text" | "decision";     // генерация текста (LLM) / типизированные решения (Laya)
  endpoint: string;              // базовый URL без логина/пароля, query и fragment
  model: string | null;          // null у decision-агента
  status: "up" | "down";
  latencyMs: number | null;      // время ответа /health; null, если down
  checkedAt: number;
}
```

Список берётся из конфигурации оркестратора (`LLM_BASE_URL`/`LLM_MODEL` — текстовый агент,
`LAYA_API_BASE_URL` — decision-агент). При каждом запросе оркестратор параллельно делает
`GET <база без /v1>/health` с таймаутом 1,5 с и без ключей авторизации; ошибка сети, таймаут и
не-2xx дают `down`, сам запрос не падает.

## Widget API (публичный, для веб-чат-виджета на сайте)

Не использует `HARNESS_API_KEY`/`ADMIN_API_KEY`. Браузер аутентифицируется publishable-ключом
канала (только чтобы получить visitor-токен), дальше — visitor-токеном. На каждом запросе
`Origin` обязан быть в `allowedOrigins` канала (нет `Origin` → `403`).

Заголовки:

- `X-Publishable-Key: pk_...` — только для `POST /v1/widget/visitors`;
- `X-Visitor-Token: <токен>` — для остальных `/v1/widget/*`.

**CORS**: `OPTIONS /v1/widget/*` → `204`, если `Origin` есть в `allowedOrigins` хотя бы одного
включённого web-канала (preflight не несёт ключей, конкретный канал проверяется уже на самом
запросе), иначе `403`. Ответы с разрешённым `Origin` содержат `Access-Control-Allow-Origin: <origin>`
и `Vary: Origin`.

Visitor-токен: 32 случайных байта (base64url), в БД — только sha256. Срок жизни скользящий:
`ANON_RETENTION_HOURS` (24 ч) с последнего использования. Каждый запрос с токеном продлевает его
и обновляет `lastSeenAt` и `last_ip` пользователя.

### `POST /v1/widget/visitors`

Без тела. Создаёт анонимного пользователя канала → `201`
`{ "visitorToken": "...", "expiresAt": 0 }`.

| Статус | Когда |
|---|---|
| `401` | неизвестный publishable-ключ |
| `403` | `Origin` не в `allowedOrigins`, канал отключён, IP заблокирован |
| `429` | больше `WIDGET_VISITORS_PER_HOUR_PER_IP` новых токенов с IP за час |

### `POST /v1/widget/threads`

Без тела. Новый разговор посетителя → `201` `{ "threadId": "<наш id>" }`.

### `POST /v1/widget/messages`

```json
{
  "threadId": "<из /v1/widget/threads>",
  "text": "...",
  "customerContext": { "country": "Kazakhstan", "city": "Qyzylorda" }
}
```

`customerContext` — необязательный плоский объект (`Record<string, string | number | boolean>`,
без вложенности), который сайт-интеграция уже знает о посетителе и который браузер не может
надёжно определить сам (например, город доставки, выбранный в собственном UI сайта, а не через
геолокацию — см. атрибут `customer-context` в `packages/pleiades-widget`). Каждое поле попадает в
`WorldState` прогона под именем `customer:<key>` (`customer:country`, `customer:city`, …) — namespaced,
чтобы никогда не конфликтовать со служебными фактами (`threadId`, `replied`, `messageIntent`, …);
сам оркестратор эти факты не интерпретирует, только передаёт дальше действиям каталога (см.
`docs/laya-autonomous-webmcp.md`, раздел «Приоритет: не каждое сообщение — задача»). Размер
`customerContext` в виде JSON-строки ограничен тем же `WIDGET_MAX_TEXT_CHARS`, что и `text` — `413`
при превышении.

Ответ — тот же NDJSON-стрим, что у `/v1/messages` (`delta`/`done`/`error`).

### `GET /v1/widget/threads/:id/messages`

→ `200` `{ "items": [{ "id": "1", "role": "user" | "assistant", "content": "...", "createdAt": 0 }] }`
— последние сообщения треда (≤ `MESSAGE_RETENTION_PER_USER`), от старых к новым.

### Общие статусы для запросов с visitor-токеном

| Статус | Когда |
|---|---|
| `401` | нет/неизвестный/истёкший токен (новый токен — через `/v1/widget/visitors`) |
| `403` (пустое тело) | `Origin` не в `allowedOrigins` канала токена; пользователь заблокирован; канал отключён; канал в режиме `whitelist`, а посетитель не в белом списке; IP заблокирован (`blocked_ips`, глобально или для канала, не истёк). Модель не вызывается |
| `404` | тред не принадлежит этому посетителю (проверка по владельцу, не по id из запроса) |
| `413` | `text` длиннее `WIDGET_MAX_TEXT_CHARS`, или сериализованный `customerContext` длиннее того же лимита |
| `429` | больше `WIDGET_MESSAGES_PER_MINUTE` сообщений на токен или `WIDGET_IP_MESSAGES_PER_MINUTE` на IP в минуту |

Лимиты — в памяти процесса, сбрасываются при рестарте. IP клиента берётся из соединения; из
`X-Forwarded-For` — только при `TRUST_PROXY=true` (за своим прокси/туннелем). Блокировки и лимиты
сверяются по `sha256(IP_HASH_SALT:ip)`; открытый IP посетителя пишется в `users.last_ip` только
для админки (см. «Блокировки по IP»).

## `POST /v1/channels/:slug/identify` (server-to-server, бэкенд сайта-интеграции)

`Authorization: Bearer <secretKey канала>` (выдаётся при создании/ротации ключей канала в
админке; сравнивается по хешу за постоянное время).

```json
// запрос
{ "visitorToken": "...", "externalUserId": "<id аккаунта на сайте>" }
// ответ 200
{ "userId": "<наш id>", "merged": false }
```

- Identified-пользователя с таким `externalUserId` в канале нет → анонимный пользователь
  становится identified (тот же `userId`), `merged: false`.
- Есть → слияние в одной транзакции: треды, сообщения (с повторной обрезкой до
  `MESSAGE_RETENTION_PER_USER`), журнал расхода, GOAP-прогоны и visitor-токены переходят на
  существующего пользователя; блокировка и белый список любой из двух записей сохраняются;
  анонимная запись удаляется; `last_ip` посетителя переходит на существующего пользователя.
  `merged: true`, `userId` — существующего пользователя.
- Повтор того же запроса → `200` с тем же `userId`, `merged: false`.

| Статус | Когда |
|---|---|
| `401` | неверный секретный ключ (или канал не web) |
| `404` | неизвестный slug; токен неизвестен, истёк или выдан другим каналом |
| `409` | токен уже привязан к другому `externalUserId` |
