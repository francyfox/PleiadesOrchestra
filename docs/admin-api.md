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
  catalogLanguage: string;       // язык названий товаров на сайте, код `en`/`ru`/`pt-BR` (по умолчанию `en`)
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

- `rows` — по дням (UTC) × `kind` (`ingest` / `generate` / `decision` / `translate`; `translate` — не LLM, а переводчик сообщения CTranslate2, `provider: ctranslate2`, `action_name: translate`, токенов нет), `overall` — по `kind` за весь период.
- Перцентили — nearest-rank по `latencyMs` всех вызовов, включая упавшие (`failed` — их число).
- `tokensPerSecond` — медиана `outputTokens / latency` по успешным вызовам с usage; `null`, если
  таких нет (у Laya токенов нет).

### GOAP

### Запросы (цепочки прогонов)

Одно сообщение пользователя = **запрос**: первый прогон плюс по одному на каждый ответ браузерного
тула (прогон останавливается на `waiting` и возобновляется новым). Прогоны одного запроса связаны
`plan_runs.root_run_id` (корень — сам первый прогон; у старых строк `NULL` читается как «сам себе
корень»). Трассы цепочки живут, пока жив хотя бы один ответ в `messages` (см. `trimUserHistory`).

`GET /v1/admin/requests?page=&pageSize=&status=&intent=` (новые первыми; без `pageSize` — 25; `status` — одно из значений ниже, `intent` — точное совпадение с `intent` строки; с фильтром `total` — число подходящих запросов; статус не колонка БД, поэтому с фильтром оркестратор собирает сводки всех запросов и режет страницу после) →

```json
{ "items": [{ "id": "<id первого прогона>", "userId": "", "threadId": "", "prompt": "купи 1 сыр",
              "intent": "addToCart", "status": "running" | "waiting" | "succeeded" | "failed" | "abandoned",
              "steps": ["choose_store", "search_products"], "runs": 2, "startedAt": 0, "durationMs": 0 }],
  "total": 1 }
```

`status`: `running` — прогон идёт сейчас (реестр `ActiveRuns` в памяти оркестратора); `waiting` — последний
прогон остановился на браузерном туле и тул ещё не ответил (< 5 мин); `abandoned` — не ответил дольше
5 минут; иначе `succeeded`/`failed` по последнему прогону. `steps` — действия по порядку завершения
плюс то, которое сейчас выполняет браузер. `durationMs` у идущего запроса — до «сейчас». `prompt`
обрезан до 200 символов; для запросов, записанных до появления колонки, берётся из `userMessage`
первого плана.

`GET /v1/admin/requests/:id` (подходит id любого прогона цепочки; неизвестный → `404`) →

```json
{
  "request": { "id": "", "userId": "", "threadId": "", "prompt": "", "intent": "addToCart", "status": "succeeded",
               "goal": {}, "reply": "ответ ассистента или null", "startedAt": 0, "durationMs": 0 },
  "runs": [{ "id": "", "createdAt": 0, "durationMs": 0, "succeeded": true, "running": false,
             "events": [{ "seq": 0, "type": "planned", "attempt": 0, "action": null, "payload": {}, "at": 0 }] }],
  "llmCalls": [{ "planRunId": "", "actionName": "", "kind": "generate", "provider": "albedo", "model": "",
                 "inputTokens": 0, "outputTokens": 0, "latencyMs": 0, "ok": true, "error": null, "at": 0 }],
  "now": 0
}
```

`events[].type` и `payload` — ровно `PlanTraceEvent` из `@repo/core` (`packages/core/src/goap/types.ts`) без полей `type`/`attempt`/`action`/`at`, вынесенных на верхний уровень; длинные строки в `state` обрезаны до 500 символов; у `finished` нет `attempt` — в колонку кладётся его `attempts`. У прогона, который идёт сейчас (`running: true`), это события, уже
случившиеся (из памяти, в БД их ещё нет). `now` — время сервера, от него считают прошедшее время
выполняемого шага.

**admin-api (BFF) → панель.** Панель не склеивает прогоны и не угадывает статусы: `GET /api/requests`
отдаёт ту же страницу, а `GET /api/requests/:id` — `RequestView`, уже готовый к отрисовке:
`nodes` (`prompt` → `translate` (только если сообщение переводилось: его вызов есть в `llm_calls` первого прогона; `label`/`detail.text` — английский текст, `durationMs` — время перевода, вызов в `detail.calls`) → `understand` (его время без перевода) → шаги плана → `result`; у каждого `round`, `status`
`done|running|browser|failed|skipped|diverged|pending|not_reached|reached|missed`, `startedAt`,
`durationMs`, `detail` с аргументами тула, временем браузера, ответом тула, эффектами, ошибкой и
вызовами моделей) и `edges` (`next`/`replan`). Браузерный тул — один шаг, хотя сервер останавливается
и возобновляется вокруг него; его `detail.browserMs` — время от паузы сервера до возобновления.
`now` отдаётся только идущему запросу (иначе ответ менялся бы при каждом чтении и live-хаб
пушил бы его бесконечно). Live-темы `/api/live`: `requests` (список, 3 с) и `request` (один запрос, 1 с).

### MCP (каталоги WebMCP-тулов сайтов)

Когда посетитель открывает виджет, страница присылает свои WebMCP-тулы (`POST /v1/widget/tools`).
Оркестратор запоминает их в `mcp_catalogs` (по версии на канал: хеш канонического списка тулов —
имена, описания, схемы; повторное объявление того же каталога только увеличивает `registrations` и
`lastSeenAt`; хранятся 5 последних версий) и **не классифицирует тот же каталог заново** (кэш в памяти
по тому же хешу, 32 каталога; смена любого описания или схемы = другой хеш = новая классификация;
перезапуск сбрасывает кэш).

`GET /v1/admin/mcp` →

```json
{ "items": [{ "channelId": "", "channelSlug": "shop", "channelName": "Shop",
              "tools": [{ "name": "search_products", "description": "…", "inputSchema": {} }],
              "toolCount": 1, "firstSeenAt": 0, "lastSeenAt": 0, "registrations": 3, "versions": 1 }] }
```

Одна запись на канал — его новейшая версия каталога (`firstSeenAt` — когда эта версия пришла впервые).
**admin-api (BFF)** разбирает `inputSchema` каждого тула в список параметров
(`name`, `type` вида `string`/`string[]`, `description`, `required`, `values` у enum): `GET /api/mcp`,
live-тема `mcp` (10 с).

### Каналы

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/v1/admin/channels?page=&pageSize=` | — | `{ "items": [Channel], "total": 3 }` |
| POST | `/v1/admin/channels` | `{ "slug", "name", "kind": "web", "accessMode", "allowedOrigins": [], "catalogLanguage"?: "ru" }` | `{ "channel": Channel, "secretKey": "..." }` |
| PATCH | `/v1/admin/channels/:id` | `{ "name"?, "accessMode"?, "allowedOrigins"?, "catalogLanguage"?, "disabled"?: boolean }` | `{ "channel": Channel }` |
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

`catalogLanguage` — код языка (`^[a-z]{2}(-[A-Z]{2})?$`, не название; иначе `422` у оркестратора и
`400 invalid_language` у admin-api), на котором на сайте написаны названия товаров. Поисковый запрос уходит в
тул сайта именно на нём, что бы ни написал покупатель: для `en` — из английского перевода сообщения, для `ru` —
из самого сообщения (правила `extractProductRequestRu`), для остальных языков — слова покупателя как есть.
Попадает в `WorldState` как факт `catalogLang` (служебный, модели delta его не видят).

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
  role: "text" | "decision" | "function-call"; // текст (LLM) / типизированные решения (Laya) / JSON-аргументы вызова функции (delta)
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

### `POST /v1/widget/tools`

```json
{
  "threadId": "<из /v1/widget/threads>",
  "webmcpTools": [
    { "name": "search_products", "description": "...", "inputSchema": { "type": "object", "properties": {} } }
  ]
}
```

Регистрирует список WebMCP-тулов, которые виджет сейчас видит в браузере через
`navigator.modelContext` (пусто в режиме `toolMode: "mcp"`, и сегодня — в любом реальном браузере,
см. `docs/laya-autonomous-webmcp.md`, раздел «WebMCP: раунд-трип с браузером»). Каждый тул
классифицируется один раз через Laya (`createWebMcpActions`, `@repo/core`) и кэшируется на
сервере **в памяти, по threadId** — виджет вызывает это **один раз при открытии панели** (и
повторно при смене `toolMode`), а не на каждое сообщение: реальный каталог (десяток+ тулов с
настоящими описаниями/схемами) — это несколько кБ, и переклассифицировать его через Laya на
каждое сообщение было и медленно, и — вместе с размером — приводило к `413` уже на первом
сообщении. Пустой список (`webmcpTools: []`) очищает кэш для этого треда (например, при переходе
в режим `mcp`). `POST /v1/widget/messages` и `POST /v1/widget/tool-results` сами каталог больше
не принимают — сервер берёт его из кэша.

Размер `webmcpTools` в виде JSON-строки ограничен `WIDGET_MAX_WEBMCP_TOOLS_CHARS` (по умолчанию
20000 — сильно больше `WIDGET_MAX_TEXT_CHARS`, регистрация разовая, не на каждое сообщение) —
`413` при превышении. Успех → `204`, без тела.

### `POST /v1/widget/messages`

```json
{
  "threadId": "<из /v1/widget/threads>",
  "text": "...",
  "page": "/ru/store/greenleaf?q=milk",
  "customerContext": { "country": "Kazakhstan", "city": "Qyzylorda" }
}
```

`page` — необязательно, `pathname + search` страницы, на которой сейчас посетитель (без origin и
`#hash`; язык в пути `/ru/…` и параметры остаются — это часть адреса; до 512 символов, иначе `422`).
Виджет шлёт её с каждым `/messages` и с каждым `/tool-results` заново (WebMCP-тул мог сменить
страницу). В `WorldState`: `page:path` (как пришло) и `page:lang` (из префикса `/ru/` или
`?lang=`/`?locale=`); Laya получает `{ message, page, lang }` при определении намерения. Тул-навигация
(интент `navigate`) не вызывается в браузере, если адрес назначения — та же страница
(`samePage`: язык и `utm_*`/`gclid`/… не считаются, параметры назначения сравниваются как набор).

`customerContext` — необязательный плоский объект (`Record<string, string | number | boolean>`,
без вложенности), который сайт-интеграция уже знает о посетителе и который браузер не может
надёжно определить сам (например, город доставки, выбранный в собственном UI сайта, а не через
геолокацию — см. атрибут `customer-context` в `packages/pleiades-widget`). Каждое поле попадает в
`WorldState` прогона под именем `customer:<key>` (`customer:country`, `customer:city`, …) — namespaced,
чтобы никогда не конфликтовать со служебными фактами (`threadId`, `replied`, `messageIntent`, …);
сам оркестратор эти факты не интерпретирует, только передаёт дальше действиям каталога (см.
`docs/laya-autonomous-webmcp.md`, раздел «Приоритет: не каждое сообщение — задача»).

Размер `customerContext` в виде JSON-строки ограничен тем же `WIDGET_MAX_TEXT_CHARS`, что и
`text` — `413` при превышении.

Ответ — тот же NDJSON-стрим, что у `/v1/messages` (`delta`/`done`/`error`), плюс нетерминальная
строка `step` (ход выполнения) и терминальная строка `tool_call`:

```json
{ "type": "step", "id": "search_products", "phase": "running", "text": "Ищу «cheese»…" }
{ "type": "step", "id": "search_products", "phase": "done", "text": "Нашёл: Mozzarella Cheese" }
```

`step` — «что сейчас происходит» для пользователя, готовым текстом на его языке (`page:lang`:
русский/казахский → русский, остальные → английский; без языка страницы — русский). `id` — имя действия
плана; следующая строка с тем же `id` **заменяет** предыдущую (начал → закончил). `phase`:
`running` | `done` | `failed`. Приходят до `delta`; после `tool_call` и возобновления через
`/tool-results` поток продолжается теми же `id`. Молчат действия без описания (например, сам ответ
модели — он идёт `delta`). Клиенты, не знающие `step` (CLI, Telegram, MCP), строку игнорируют.

Терминальная строка `tool_call`:

```json
{ "type": "tool_call", "tool": "search_products", "arguments": { "query": "..." }, "callId": "..." }
```

Приходит вместо `done`/`error`, когда прогону нужен вызов WebMCP-тула — который может выполнить
только сам браузер (см. `docs/laya-autonomous-webmcp.md`). Стрим на этом закрывается; виджет
вызывает тул через `navigator.modelContext` и продолжает через `POST /v1/widget/tool-results`.

### `POST /v1/widget/tool-results`

```json
{
  "threadId": "<тот же тред>",
  "callId": "<callId из tool_call>",
  "tool": "search_products",
  "result": { "...": "..." },
  "isError": false
}
```

Резюмирует прогон, остановившийся на `tool_call`: сервер подгружает сохранённый чекпойнт
(`state` + `goal`, ровно та же цель, что план преследовал изначально — не переклассифицируется) и
тот же кэшированный каталог тулов (`POST /v1/widget/tools`), подмешивает исход тула
(`webmcp:<tool>:result` = `"ok"`/`"error"` в `WorldState`) и продолжает `runPlan` — вплоть до ещё
одного `tool_call`, если нужен второй вызов, или до `done`. `callId` сервером не читается. Текст из `result` (MCP `content[].text` или строка, до 4000
символов) кладётся в `WorldState` как `webmcp:<tool>:text` — следующий шаг читает его (например,
из ответа поиска берётся первый товар «в наличии» для `add_to_cart`); `isError` задаёт
`webmcp:<tool>:result`. Если резюмировать нечего
(чекпойнт истёк по `WORLD_STATE_RETENTION_HOURS`, устаревший `callId`, тред никогда не ждал) — это
возвращается как обычная строка `error` внутри уже начатого стрима, не отдельный HTTP-статус (см.
общие статусы ниже для `404`/`429`/и т.д. — они по-прежнему проверяются до старта стрима).

Ответ — тот же NDJSON-стрим (`delta`/`done`/`error`/`tool_call`).

### `GET /v1/widget/threads/:id/messages`

→ `200` `{ "items": [{ "id": "1", "role": "user" | "assistant", "content": "...", "createdAt": 0 }] }`
— последние сообщения треда (≤ `MESSAGE_RETENTION_PER_USER`), от старых к новым.

### Общие статусы для запросов с visitor-токеном

| Статус | Когда |
|---|---|
| `401` | нет/неизвестный/истёкший токен (новый токен — через `/v1/widget/visitors`) |
| `403` (пустое тело) | `Origin` не в `allowedOrigins` канала токена; пользователь заблокирован; канал отключён; канал в режиме `whitelist`, а посетитель не в белом списке; IP заблокирован (`blocked_ips`, глобально или для канала, не истёк). Модель не вызывается |
| `404` | тред не принадлежит этому посетителю (проверка по владельцу, не по id из запроса) |
| `413` | `text`/`customerContext` длиннее `WIDGET_MAX_TEXT_CHARS`, или (на `/v1/widget/tools`) `webmcpTools` длиннее `WIDGET_MAX_WEBMCP_TOOLS_CHARS` |
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
