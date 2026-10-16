---
title: Server API
lang: ru
---

# Server API

Эндпоинты для вашего бэкенда, ботов и скриптов. Они отделены от браузерного [Widget API](/docs/api/widget/): браузер их никогда не вызывает.

## Аутентификация

| Эндпоинт | Учётные данные |
| --- | --- |
| `POST /v1/messages`, `POST /v1/access` | `Authorization: Bearer <HARNESS_API_KEY>`: транспортный секрет, настроенный в `alpha-orchestrator` (то же значение, что в `telegram-bot` и CLI). |
| `POST /v1/channels/:slug/identify` | `Authorization: Bearer sk_...`: **секретный ключ** канала. Транспортный ключ здесь не принимается и не нужен. |

Транспортный запрос с отсутствующим или неверным ключом получает `401` с телом `Unauthorized`. `/health` и `/swagger` открыты; интерактивный справочник API находится на `/swagger`.

Никогда не помещайте `HARNESS_API_KEY` или ключ `sk_` на страницу или в клиентский бандл.

## Отправка сообщения

`POST /v1/messages`: транспорт (чат-бот, CLI, ваш бэкенд) отправляет сообщение пользователя и читает ответ в виде NDJSON.

| Поле тела | Тип | Обязательно | Примечания |
| --- | --- | --- | --- |
| `threadId` | string | да | Ваш собственный id разговора. Уникален в пределах канала и пользователя; первое использование создаёт тред. |
| `userId` | string | да | Id пользователя в вашей системе, в пределах канала. Пользователь создаётся при первом использовании. |
| `text` | string | да | |
| `channel` | string | нет | Slug канала. По умолчанию `cli`. |
| `displayName` | string | нет | Сохраняется вместе с пользователем. |

```sh
curl -N -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer $HARNESS_API_KEY" \
  -H "content-type: application/json" \
  -d '{"channel":"support-bot","threadId":"chat-17","userId":"u-42","displayName":"Aida","text":"What can you do?"}'
```

Ответ имеет тип `application/x-ndjson` (gzip, если запрос отправляет `accept-encoding: gzip`). Типы строк те же, что описаны в [Widget API: Поток](/docs/api/widget/#Stream): `delta`, `step`, `done`, `error`.

<!-- TODO: `POST /v1/messages` does not pass `page` or `customerContext` and has no browser to run tools, so a `tool_call` line should not be expected there. Not verified end to end. -->

| Статус | Значение |
| --- | --- |
| `200` | Поток начат. |
| `401` | Неверный или отсутствующий транспортный ключ. |
| `403` | Пользователю не разрешено (он заблокирован, либо канал в режиме белого списка, а пользователя в нём нет, либо канал отключён). Пустое тело: модель не вызывается. |
| `404` | `Unknown channel`. |
| `422` | Тело не соответствует схеме. |

## Проверка доступа

`POST /v1/access`: спросите, может ли отправитель общаться с ботом, прежде чем отвечать ему. Пользователь создаётся при первом использовании.

| Поле тела | Тип | Обязательно |
| --- | --- | --- |
| `channel` | string | да |
| `externalUserId` | string | да |
| `displayName` | string | нет |

```sh
curl -X POST http://localhost:3000/v1/access \
  -H "Authorization: Bearer $HARNESS_API_KEY" -H "content-type: application/json" \
  -d '{"channel":"support-bot","externalUserId":"u-42"}'
```

`200`: `{ "allowed": true, "userId": "…" }`. `404` `Unknown channel` для неизвестного slug.

## Идентификация посетителя

`POST /v1/channels/:slug/identify`: после того как посетитель вошёл на вашем сайте, свяжите его анонимную сессию виджета с вашим собственным id аккаунта. Вызывайте это с вашего сервера.

1. На странице прочитайте токен: `await document.querySelector("pleiades-chat").getVisitorToken()`.
2. Отправьте его на ваш бэкенд, который вызывает identify с секретным ключом канала.

| Поле тела | Тип | Обязательно | Примечания |
| --- | --- | --- | --- |
| `visitorToken` | string | да | Из виджета. |
| `externalUserId` | string, непустая | да | Id вашего аккаунта. |

```sh
curl -X POST https://agent.example.com/v1/channels/my-shop/identify \
  -H "Authorization: Bearer $CHANNEL_SECRET_KEY" \
  -H "content-type: application/json" \
  -d '{"visitorToken":"…","externalUserId":"account-9001"}'
```

`200`: `{ "userId": "…", "merged": false }`.

- Аккаунта с таким `externalUserId` в канале ещё нет: анонимный пользователь повышается на месте, `merged: false`.
- Аккаунт существует: треды, сообщения и запуски анонимного пользователя переносятся на него в одной транзакции, а анонимная запись удаляется, `merged: true`. Блокировка с любой из сторон сохраняется при слиянии, как и включение в белый список.
- Повтор того же вызова ничего не меняет.

| Статус | Значение |
| --- | --- |
| `401` | Неверный секретный ключ либо канал не является веб-каналом. |
| `404` | Неизвестный slug канала, либо неизвестный или просроченный токен посетителя (или токен другого канала). |
| `409` | Токен уже привязан к другому аккаунту. |
| `422` | Тело не соответствует схеме. |
