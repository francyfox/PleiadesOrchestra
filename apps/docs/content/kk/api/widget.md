---
title: Widget API
lang: kk
review: pending
---

# Widget API

[`<pleiades-chat>` виджеті](/docs/widget/) қолданатын браузерге арналған API. Бұл бет тек өз клиентіңізді жасау немесе виджетті жөндеу үшін керек. Барлық жолдар `/v1/widget` астында.

## Аутентификация

| Тақырып | Кім қолданады | Мағынасы |
| --- | --- | --- |
| `x-publishable-key: pk_...` | тек `POST /visitors` | Арнаның ашық кілті. |
| `x-visitor-token` | қалған барлық эндпоинттер | `POST /visitors` қайтарған токен. |
| `Origin` | барлығы (браузер орнатады) | Арнаның рұқсат етілген origin-дерінің бірі болуы керек. |
| `content-type: application/json` | денесі бар `POST` | |

Реттілік: кілтпен келуші токенін бір рет алыңыз, содан кейін тек токенді жіберіңіз. Токен серверде хэштелген күйде сақталады және жылжымалы өмір сүру мерзімі бар (әдепкі 24 сағат, әр қолданғанда ұзартылады). Токені жоқ, белгісіз немесе мерзімі өткен сұраныс `401` алады; сонда клиент жаңа келуші құруы керек.

Бұл эндпоинттердің ешқайсысына транспорттық `HARNESS_API_KEY` қажет емес; ол кілт [server API](/docs/api/server/) үшін.

### CORS

`OPTIONS /v1/widget/*` `Origin` веб-арнаға тиесілі болса, мына тақырыптармен `204` жауап береді, әйтпесе бос `403`:

| Тақырып | Мәні |
| --- | --- |
| `access-control-allow-origin` | сұраныстың `Origin` мәні |
| `access-control-allow-methods` | `GET, POST, OPTIONS` |
| `access-control-allow-headers` | `content-type, x-visitor-token, x-publishable-key` |
| `access-control-max-age` | `600` |

Басқа жауаптарда origin белгілі болғанда `access-control-allow-origin: <Origin>` және `vary: Origin` болады. Origin арна үшін рұқсат етілмегенде сервер CORS тақырыптарынсыз `403` жауап береді, сондықтан браузер желі қатесін хабарлайды және себебін жасырады.

## Эндпоинттер

### `POST /v1/widget/visitors`

Анонимді келуші құрады.

```sh
curl -i -X POST https://agent.example.com/v1/widget/visitors \
  -H "Origin: https://shop.example" \
  -H "x-publishable-key: pk_your_channel_key"
```

`201`:

```json
{ "visitorToken": "…", "expiresAt": 1790000000000 }
```

`expiresAt` — миллисекундтағы Unix уақыт белгісі.

### `POST /v1/widget/threads`

Келуші үшін сөйлесу бастайды.

```sh
curl -X POST https://agent.example.com/v1/widget/threads \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN"
```

`201`: `{ "threadId": "…" }`.

### `GET /v1/widget/threads/:id/messages`

Тредтегі келушінің соңғы тарихы (әдепкіде соңғы 10 хабарлама), ескісі бірінші. Тред келушіге тиесілі болмаса, `404`.

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

`steps` құралдарды қолданған жауапта болады.

### `POST /v1/widget/messages`

Хабарлама жібереді және жауапты NDJSON ретінде ағынмен береді ([Stream](#Stream) бөлімін қараңыз).

| Дене өрісі | Түрі | Міндетті | Ескертпелер |
| --- | --- | --- | --- |
| `threadId` | string | иә | Осы келушінің треді. |
| `text` | string | иә | Ең көбі `WIDGET_MAX_TEXT_CHARS` (әдепкі 2000), әйтпесе `413`. |
| `page` | string | жоқ | Келушінің `pathname + search` мәні, ең көбі 512 таңба. |
| `customerContext` | object | жоқ | Жол, сан немесе булев мәндерінің жазық картасы. Оның JSON-ы `text` сияқты таңба шегінен аспауы керек, әйтпесе `413`. |

```sh
curl -N -X POST https://agent.example.com/v1/widget/messages \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"threadId":"'"$THREAD"'","text":"book a double room for Friday","page":"/rooms"}'
```

### `POST /v1/widget/tools`

Тред үшін беттің құралдар каталогын тіркейді. Виджет оны панель ашылғанда және каталог өзгергенде шақырады. [Құралдар](/docs/tools/) бөлімін қараңыз.

| Дене өрісі | Түрі | Ескертпелер |
| --- | --- | --- |
| `threadId` | string | Осы келушінің треді. |
| `webmcpTools` | array | Әр элемент: `name` (string), міндетті емес `description` (string), міндетті емес `inputSchema` `{ type: "object", properties?, required? }`. |

Сериализацияланған `webmcpTools` `WIDGET_MAX_WEBMCP_TOOLS_CHARS` (әдепкі 20 000) мәнінен аспауы керек, әйтпесе `413`. Схемадан тыс өрістер алынып тасталады. Бос массив тредтің каталогын тазалайды. Жауап: `204`, денесіз.

```sh
curl -X POST https://agent.example.com/v1/widget/tools \
  -H "Origin: https://shop.example" -H "x-visitor-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"threadId":"'"$THREAD"'","webmcpTools":[{"name":"set_pizza_size","description":"Set the pizza size.","inputSchema":{"type":"object","properties":{"size":{"type":"string","enum":["small","medium","large"]}},"required":["size"]}}]}'
```

### `POST /v1/widget/tool-results`

`tool_call` жолына жауап береді және жұмысты жалғастырады. Жауап — сол жол түрлері бар жаңа NDJSON ағыны.

| Дене өрісі | Түрі | Міндетті | Ескертпелер |
| --- | --- | --- | --- |
| `threadId` | string | иә | |
| `callId` | string | иә | Жауап берілетін `tool_call` жолының `callId` мәні. |
| `tool` | string | иә | Сол жолдың `tool` мәні. |
| `result` | any | иә | Құрал қайтарған нәрсе. MCP `{content:[{text}]}`, жол немесе JSON; оның мәтіні сақталады (4000 таңба). |
| `isError` | boolean | жоқ | Әдепкі `false`. |
| `page` | string | жоқ | Келушінің қазір тұрған жері (құрал навигация жасаған болуы мүмкін). |

<!-- TODO: what a mismatched callId/tool produces on the wire (the server throws "unexpected tool result for this thread" in prepareResume; not verified whether it arrives as an `error` stream line or an HTTP status). -->

## Stream

`POST /messages` және `POST /tool-results` `content-type: application/x-ndjson` жауабын береді: әр жолда бір JSON-объект. Сұраныс `accept-encoding: gzip` жіберсе, дене gzip-пен сығылады (`content-encoding: gzip`).

| `type` | Өрістер | Терминал ма? |
| --- | --- | --- |
| `delta` | `text` | жоқ. Жауап мәтінінің бөлігі; оны қосып отырыңыз. |
| `step` | `id`, `phase` (`running`, `done`, `failed`), `text` | жоқ. Келушінің тіліндегі прогресс. Сол `id`-мен кейінгі `step` ертерегін ауыстырады. |
| `tool_call` | `tool`, `arguments`, `callId` | осы ағынды аяқтайды. Құралды браузерде орындап, `POST /tool-results` шақырыңыз. |
| `done` | `elapsedMs`; міндетті емес `inputTokens`, `outputTokens`, `totalInputTokens`, `totalOutputTokens` | иә. Мақсатқа жетті. |
| `error` | `message`; міндетті емес `code`, `hint` | иә. |

`code: "task_failed"` бар `error` сервердің жұмыс істегенін, бірақ сайт тапсырманы орындай алмағанын білдіреді. `hint` — сайттың өз соңғы құрал жауабы (ең көбі 400 таңба), әдетте не істеп көру керектігі туралы кеңес. Кодсыз `error` — сервер жағындағы ақау. Үзілген қосылым ешқашан жол ретінде келмейді; клиент оны өзі байқайды.

Мысал:

```
{"type":"step","id":"search_rooms","phase":"running","text":"Looking for rooms…"}
{"type":"tool_call","tool":"search_rooms","arguments":{"checkIn":"2026-11-06","checkOut":"2026-11-08","guests":2},"callId":"6f1c…"}
```

Клиент `search_rooms` орындайды, содан кейін нәтижені жібереді және келесі ағынды оқиды:

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

(Жоғарыдағы қадам мәтіндері көрнекілік үшін; нақты мәтіндер құралға және келушінің тіліне байланысты.)

Бір жұмыс `done` немесе `error` алдында бірнеше `tool_call` жолын бірінен соң бірін, әрқайсысын өз ағынында шығара алады.

## Қате статустары

Қате жауаптарының денесі бос.

| Статус | Қайда | Мағынасы |
| --- | --- | --- |
| `401` | `/visitors` қоспағанда барлығы | `x-visitor-token` жоқ, белгісіз немесе мерзімі өткен. Жаңа келуші құрыңыз. |
| `401` | `/visitors` | Ашық кілт белгісіз. |
| `403` | барлығы | Origin рұқсат етілмеген, арна өшірілген, келушіге рұқсат жоқ (қолжетімділік режимі немесе бұғатталған) немесе IP бұғатталған. |
| `404` | тред маршруттары | Тред жоқ немесе басқа келушіге тиесілі. |
| `413` | `/messages`, `/tools`, кез келген | Мәтін, `customerContext` немесе каталог шегінен асты; немесе кез келген виджет маршрутында `Content-Length` `WIDGET_MAX_BODY_BYTES` мәнінен асты (әдепкі 131072). |
| `422` | `POST` маршруттары | Дене схемаға сәйкес емес (Elysia валидациясы). |
| `429` | төменде қараңыз | Жылдамдық шегі. |

## Жылдамдық шектеулері

Бекітілген терезелер, жадыда, сервер данасы бойынша. Әдепкі мәндер, әрқайсысы `alpha-orchestrator` ортасының айнымалысымен беріледі:

| Шектеу | Қолданылатын жер | Әдепкі | Айнымалы |
| --- | --- | --- | --- |
| Келуші токені бойынша минутына хабарламалар | `POST /messages`, `POST /tools` | 10 | `WIDGET_MESSAGES_PER_MINUTE` |
| Клиент IP бойынша минутына хабарламалар | сол | 30 | `WIDGET_IP_MESSAGES_PER_MINUTE` |
| Келуші токені бойынша минутына құрал нәтижелері | `POST /tool-results` | 120 | `WIDGET_TOOL_RESULTS_PER_MINUTE` |
| Келуші токені бойынша сағатына тредтер | `POST /threads` | 30 | `WIDGET_THREADS_PER_HOUR` |
| Клиент IP бойынша сағатына жаңа келушілер | `POST /visitors` | 20 | `WIDGET_VISITORS_PER_HOUR_PER_IP` |

`POST /tools` құрал нәтижелерінің шегіне емес, хабарлама шектеріне есептеледі. Құрал нәтижелерінің шегі бөлек, себебі бір сұраныс браузермен көптеген кері-тура жүрістерге тарала алады (12 жолды себетті тазалау — 13).

Клиент IP әдепкіде сокеттен алынады (`CLIENT_IP_SOURCE`, әдепкі `socket`). Прокси артында оператор басқа көзді және қанша прокси секіруіне сену керектігін `TRUSTED_PROXY_HOPS` арқылы таңдайды (әдепкі 1).
