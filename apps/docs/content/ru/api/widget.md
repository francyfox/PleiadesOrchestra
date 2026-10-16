---
title: Widget API
lang: ru
---

# Widget API

Браузерное API, которое использует [виджет `<pleiades-chat>`](/docs/widget/). Эта страница нужна только для создания собственного клиента или отладки виджета. Все пути находятся под `/v1/widget`.

## Аутентификация

| Заголовок | Кем используется | Значение |
| --- | --- | --- |
| `x-publishable-key: pk_...` | только `POST /visitors` | Публичный ключ канала. |
| `x-visitor-token` | все остальные эндпоинты | Токен, возвращённый `POST /visitors`. |
| `Origin` | все (устанавливается браузером) | Должен входить в список разрешённых origin'ов канала. |
| `content-type: application/json` | `POST` с телом | |

Порядок такой: один раз получите токен посетителя по ключу, затем отправляйте только токен. Токен хранится на сервере в виде хеша и имеет скользящий срок жизни (по умолчанию 24 часа, продлевается при каждом использовании). Запрос с отсутствующим, неизвестным или просроченным токеном получает `401`; после этого клиент должен создать нового посетителя.

Ни одному из этих эндпоинтов не нужен транспортный `HARNESS_API_KEY`; этот ключ предназначен для [Server API](/docs/api/server/).

### CORS

`OPTIONS /v1/widget/*` отвечает `204` со следующими заголовками, когда `Origin` принадлежит веб-каналу, и пустым `403` в остальных случаях:

| Заголовок | Значение |
| --- | --- |
| `access-control-allow-origin` | `Origin` запроса |
| `access-control-allow-methods` | `GET, POST, OPTIONS` |
| `access-control-allow-headers` | `content-type, x-visitor-token, x-publishable-key` |
| `access-control-max-age` | `600` |

Остальные ответы содержат `access-control-allow-origin: <Origin>` и `vary: Origin`, когда origin известен. Если origin не разрешён для канала, сервер отвечает `403` **без** заголовков CORS, поэтому браузер сообщает о сетевой ошибке и скрывает причину.

## Эндпоинты

### `POST /v1/widget/visitors`

Создаёт анонимного посетителя.

```sh
curl -i -X POST https://agent.example.com/v1/widget/visitors \
  -H "Origin: https://shop.example" \
  -H "x-publishable-key: pk_your_channel_key"
```

`201`:

```json
{ "visitorToken": "…", "expiresAt": 1790000000000 }
```

`expiresAt` — Unix-время в миллисекундах.

### `POST /v1/widget/threads`

Начинает разговор для посетителя.

```sh
curl -X POST https://agent.example.com/v1/widget/threads \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN"
```

`201`: `{ "threadId": "…" }`.

### `GET /v1/widget/threads/:id/messages`

Недавняя история посетителя в треде (по умолчанию последние 10 сообщений), сначала самые старые. `404`, если тред не принадлежит посетителю.

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

`steps` присутствует в ответе, в котором использовались инструменты.

### `POST /v1/widget/messages`

Отправляет сообщение и передаёт ответ потоком NDJSON (см. [Поток](#Stream)).

| Поле тела | Тип | Обязательно | Примечания |
| --- | --- | --- | --- |
| `threadId` | string | да | Тред этого посетителя. |
| `text` | string | да | Не более `WIDGET_MAX_TEXT_CHARS` (по умолчанию 2000), иначе `413`. |
| `page` | string | нет | `pathname + search` посетителя, не более 512 символов. |
| `customerContext` | object | нет | Плоская карта строковых, числовых или булевых значений. Её JSON не должен превышать тот же лимит символов, что и `text`, иначе `413`. |

```sh
curl -N -X POST https://agent.example.com/v1/widget/messages \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"threadId":"'"$THREAD"'","text":"book a double room for Friday","page":"/rooms"}'
```

### `POST /v1/widget/tools`

Регистрирует каталог инструментов страницы для треда. Виджет вызывает его при открытии панели и снова при изменении каталога. См. [Инструменты](/docs/tools/).

| Поле тела | Тип | Примечания |
| --- | --- | --- |
| `threadId` | string | Тред этого посетителя. |
| `webmcpTools` | array | Каждый элемент: `name` (string), необязательный `description` (string), необязательный `inputSchema` `{ type: "object", properties?, required? }`. |

Сериализованный `webmcpTools` не должен превышать `WIDGET_MAX_WEBMCP_TOOLS_CHARS` (по умолчанию 20 000), иначе `413`. Поля вне схемы отбрасываются. Пустой массив очищает каталог треда. Ответ: `204`, без тела.

```sh
curl -X POST https://agent.example.com/v1/widget/tools \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"threadId":"'"$THREAD"'","webmcpTools":[{"name":"set_pizza_size","description":"Set the pizza size.","inputSchema":{"type":"object","properties":{"size":{"type":"string","enum":["small","medium","large"]}},"required":["size"]}}]}'
```

### `POST /v1/widget/tool-results`

Отвечает на строку `tool_call` и возобновляет запуск. Ответ — новый поток NDJSON с теми же типами строк.

| Поле тела | Тип | Обязательно | Примечания |
| --- | --- | --- | --- |
| `threadId` | string | да | |
| `callId` | string | да | `callId` строки `tool_call`, на которую даётся ответ. |
| `tool` | string | да | `tool` из этой же строки. |
| `result` | any | да | То, что вернул инструмент. MCP `{content:[{text}]}`, строка или JSON; сохраняется его текст (4000 символов). |
| `isError` | boolean | нет | По умолчанию `false`. |
| `page` | string | нет | Где посетитель находится сейчас (инструмент мог выполнить переход). |

<!-- TODO: what a mismatched callId/tool produces on the wire (the server throws "unexpected tool result for this thread" in prepareResume; not verified whether it arrives as an `error` stream line or an HTTP status). -->

## Поток

`POST /messages` и `POST /tool-results` отвечают с `content-type: application/x-ndjson`: один JSON-объект на строку. Тело сжимается gzip (`content-encoding: gzip`), когда запрос отправляет `accept-encoding: gzip`.

| `type` | Поля | Завершающий? |
| --- | --- | --- |
| `delta` | `text` | нет. Фрагмент текста ответа; дописывайте его. |
| `step` | `id`, `phase` (`running`, `done`, `failed`), `text` | нет. Прогресс на языке посетителя. Более поздний `step` с тем же `id` заменяет предыдущий. |
| `tool_call` | `tool`, `arguments`, `callId` | завершает этот поток. Выполните инструмент в браузере и вызовите `POST /tool-results`. |
| `done` | `elapsedMs`; необязательные `inputTokens`, `outputTokens`, `totalInputTokens`, `totalOutputTokens` | да. Цель достигнута. |
| `error` | `message`; необязательные `code`, `hint` | да. |

`error` с `code: "task_failed"` означает, что сервер отработал, но сайт не смог выполнить задачу. `hint` — последний ответ инструмента самого сайта (не более 400 символов), обычно совет о том, что попробовать. `error` без кода — сбой на стороне сервера. Оборванное соединение никогда не приходит строкой; клиент замечает его сам.

Пример:

```
{"type":"step","id":"search_rooms","phase":"running","text":"Looking for rooms…"}
{"type":"tool_call","tool":"search_rooms","arguments":{"checkIn":"2026-11-06","checkOut":"2026-11-08","guests":2},"callId":"6f1c…"}
```

Клиент выполняет `search_rooms`, затем отправляет результат и читает следующий поток:

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

(Тексты шагов выше приведены для иллюстрации; реальные тексты зависят от инструмента и языка посетителя.)

Запуск может выдать несколько строк `tool_call` одну за другой, каждую в своём потоке, до `done` или `error`.

## Статусы ошибок

Ответы с ошибками имеют пустое тело.

| Статус | Где | Значение |
| --- | --- | --- |
| `401` | все, кроме `/visitors` | Отсутствующий, неизвестный или просроченный `x-visitor-token`. Создайте нового посетителя. |
| `401` | `/visitors` | Неизвестный publishable key. |
| `403` | все | Origin не разрешён, канал отключён, посетителю не разрешено (режим доступа или блокировка) или IP заблокирован. |
| `404` | маршруты тредов | Тред не существует или принадлежит другому посетителю. |
| `413` | `/messages`, `/tools`, любой | Текст, `customerContext` или каталог превышают свой лимит; либо `Content-Length` превышает `WIDGET_MAX_BODY_BYTES` (по умолчанию 131072) на любом маршруте виджета. |
| `422` | маршруты `POST` | Тело не соответствует схеме (валидация Elysia). |
| `429` | см. ниже | Ограничение частоты запросов. |

## Ограничения частоты запросов

Фиксированные окна, в памяти, отдельно для каждого экземпляра сервера. Значения по умолчанию; каждое задаётся переменной окружения `alpha-orchestrator`:

| Лимит | Применяется к | По умолчанию | Переменная |
| --- | --- | --- | --- |
| Сообщений на токен посетителя в минуту | `POST /messages`, `POST /tools` | 10 | `WIDGET_MESSAGES_PER_MINUTE` |
| Сообщений на IP клиента в минуту | то же | 30 | `WIDGET_IP_MESSAGES_PER_MINUTE` |
| Результатов инструментов на токен посетителя в минуту | `POST /tool-results` | 120 | `WIDGET_TOOL_RESULTS_PER_MINUTE` |
| Тредов на токен посетителя в час | `POST /threads` | 30 | `WIDGET_THREADS_PER_HOUR` |
| Новых посетителей на IP клиента в час | `POST /visitors` | 20 | `WIDGET_VISITORS_PER_HOUR_PER_IP` |

`POST /tools` учитывается в лимитах сообщений, а не в лимите результатов инструментов. Лимит результатов инструментов отдельный, потому что один запрос может породить много обращений к браузеру (очистка корзины из 12 строк — это 13).

IP клиента по умолчанию берётся из сокета (`CLIENT_IP_SOURCE`, по умолчанию `socket`). За прокси оператор выбирает другой источник и количество доверенных прокси-узлов через `TRUSTED_PROXY_HOPS` (по умолчанию 1).
