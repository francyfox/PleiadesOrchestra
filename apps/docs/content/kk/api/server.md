---
title: Server API
lang: kk
review: pending
---

# Server API

Сіздің бэкендіңізге, боттарға және скрипттерге арналған эндпоинттер. Олар браузерге арналған [Widget API](/docs/api/widget/)-дан бөлек: браузер оларды ешқашан шақырмайды.

## Аутентификация

| Эндпоинт | Куәлік |
| --- | --- |
| `POST /v1/messages`, `POST /v1/access` | `Authorization: Bearer <HARNESS_API_KEY>`: `alpha-orchestrator` сервисінде бапталған транспорттық құпия (`telegram-bot` және CLI-дағы мәнмен бірдей). |
| `POST /v1/channels/:slug/identify` | `Authorization: Bearer sk_...`: арнаның **құпия кілті**. Транспорттық кілт мұнда қабылданбайды және қажет емес. |

Транспорттық сұраныс кілті жоқ немесе қате болса, `401` және `Unauthorized` денесін алады. `/health` және `/swagger` ашық; интерактивті API анықтамасы `/swagger` бойынша.

`HARNESS_API_KEY` немесе `sk_` кілтін ешқашан бетке немесе клиенттік бандлға салмаңыз.

## Хабарлама жіберу

`POST /v1/messages`: транспорт (чат-бот, CLI, сіздің бэкендіңіз) пайдаланушының хабарламасын жібереді және жауапты NDJSON ретінде оқиды.

| Дене өрісі | Түрі | Міндетті | Ескертпелер |
| --- | --- | --- | --- |
| `threadId` | string | иә | Өзіңіздің сөйлесу идентификаторыңыз. Арна мен пайдаланушы бойынша бірегей; бірінші қолданғанда тред құрылады. |
| `userId` | string | иә | Сіздің жүйеңіздегі пайдаланушы идентификаторы, арна шегінде. Пайдаланушы бірінші қолданғанда құрылады. |
| `text` | string | иә | |
| `channel` | string | жоқ | Арна slug-ы. Әдепкі `cli`. |
| `displayName` | string | жоқ | Пайдаланушымен бірге сақталады. |

```sh
curl -N -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer $HARNESS_API_KEY" \
  -H "content-type: application/json" \
  -d '{"channel":"support-bot","threadId":"chat-17","userId":"u-42","displayName":"Aida","text":"What can you do?"}'
```

Жауап — `application/x-ndjson` (сұраныс `accept-encoding: gzip` жіберсе, gzip). Жол түрлері [Widget API: Stream](/docs/api/widget/#Stream) бөлімінде сипатталғандар: `delta`, `step`, `done`, `error`.

<!-- TODO: `POST /v1/messages` does not pass `page` or `customerContext` and has no browser to run tools, so a `tool_call` line should not be expected there. Not verified end to end. -->

| Статус | Мағынасы |
| --- | --- |
| `200` | Ағын басталды. |
| `401` | Транспорттық кілт қате немесе жоқ. |
| `403` | Пайдаланушыға рұқсат жоқ (бұғатталған, немесе арна whitelist режимінде және пайдаланушы whitelist-те жоқ, немесе арна өшірілген). Дене бос: модель ешқашан шақырылмайды. |
| `404` | `Unknown channel`. |
| `422` | Дене схемаға сәйкес емес. |

## Рұқсатты тексеру

`POST /v1/access`: жіберушіге жауап бермес бұрын, оның ботпен сөйлесуге құқығы бар-жоғын сұраңыз. Пайдаланушы бірінші қолданғанда құрылады.

| Дене өрісі | Түрі | Міндетті |
| --- | --- | --- |
| `channel` | string | иә |
| `externalUserId` | string | иә |
| `displayName` | string | жоқ |

```sh
curl -X POST http://localhost:3000/v1/access \
  -H "Authorization: Bearer $HARNESS_API_KEY" -H "content-type: application/json" \
  -d '{"channel":"support-bot","externalUserId":"u-42"}'
```

`200`: `{ "allowed": true, "userId": "…" }`. Белгісіз slug үшін `404` `Unknown channel`.

## Келушіні идентификациялау

`POST /v1/channels/:slug/identify`: келуші сіздің сайтыңызға кіргеннен кейін, оның анонимді виджет сессиясын өз аккаунт идентификаторыңызбен байланыстырыңыз. Оны серверіңізден шақырыңыз.

1. Бетте токенді оқыңыз: `await document.querySelector("pleiades-chat").getVisitorToken()`.
2. Оны бэкендіңізге жіберіңіз, ол identify-ді арнаның құпия кілтімен шақырады.

| Дене өрісі | Түрі | Міндетті | Ескертпелер |
| --- | --- | --- | --- |
| `visitorToken` | string | иә | Виджеттен. |
| `externalUserId` | string, бос емес | иә | Сіздің аккаунт идентификаторыңыз. |

```sh
curl -X POST https://agent.example.com/v1/channels/my-shop/identify \
  -H "Authorization: Bearer $CHANNEL_SECRET_KEY" \
  -H "content-type: application/json" \
  -d '{"visitorToken":"…","externalUserId":"account-9001"}'
```

`200`: `{ "userId": "…", "merged": false }`.

- Арнада мұндай `externalUserId` бар аккаунт әлі жоқ: анонимді пайдаланушы орнында жоғарылатылады, `merged: false`.
- Аккаунт бар: анонимді пайдаланушының тредтері, хабарламалары және жұмыстары (run) бір транзакцияда оған көшеді, ал анонимді жол жойылады, `merged: true`. Екі жақтың бірінде болған бұғаттау біріктіруден кейін сақталады, whitelist-ке қосу да.
- Дәл сол шақыруды қайталау ештеңені өзгертпейді.

| Статус | Мағынасы |
| --- | --- |
| `401` | Құпия кілт қате, немесе арна веб-арна емес. |
| `404` | Арна slug-ы белгісіз, немесе келуші токені белгісіз не мерзімі өткен (немесе басқа арнаның токені). |
| `409` | Токен басқа аккаунтқа бұрыннан байланған. |
| `422` | Дене схемаға сәйкес емес. |
