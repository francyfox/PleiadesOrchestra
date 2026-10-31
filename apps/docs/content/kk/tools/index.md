---
title: Құралдар
lang: kk
review: pending
---

# Сайттан құралдарды ашу

Оркестратор сайтыңыз туралы сіз берген құралдардан басқа ештеңе білмейді. **Құрал** — келушінің браузерінде орындалатын функция: каталогтан іздеу, брондауға бөлме қосу, пицца өлшемін орнату, тапсырысты ашу. Құралдарды [WebMCP](https://github.com/webmachinelearning/webmcp) (`document.modelContext`) арқылы тіркейсіз; виджет оларды оқиды, ал оркестратор солар бойынша жоспар құрады.

## Құралды тіркеу

```js
await document.modelContext.registerTool({
  name: "search_products",
  description: "Search the shop catalog by free-text query.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look for" },
      maxPrice: { type: "number", description: "Upper price limit" },
    },
    required: ["query"],
  },
  async execute({ query, maxPrice }) {
    const items = await shop.search(query, { maxPrice });
    return {
      content: [{ type: "text", text: items.map((i) => `- ${i.name} - $${i.price}`).join("\n") }],
    };
  },
});
```

| Өріс | Міндетті | Ескертпелер |
| --- | --- | --- |
| `name` | иә | `^[a-zA-Z0-9_.-]{1,128}$` үлгісіне сай келеді. Бетте бірегей; атауды екі рет тіркеу қате шығарады. |
| `description` | иә | Бос емес жол. |
| `inputSchema` | жоқ | `type: "object"`, `properties` және міндетті емес `required` бар JSON Schema. JSON-ға сериализацияланатын болуы керек. |
| `execute(args, options)` | иә, шақырылатын болу үшін | Аргументтер объектісін алады. Нәтиже қайтарады (төменде қараңыз). |
| `annotations` | жоқ | Polyfill сақтайды. [Annotations](#Annotations) бөлімін қараңыз. |

`registerTool` екінші аргумент ретінде `{ signal }` та қабылдайды; сигналды тоқтату құралды тіркеуден шығарады. Еркін тіркеңіз және тіркеуден шығарыңыз: беттің каталогы оның күйіне қарай өзгере алады (себет құралы тек себет бар кезде, төлем құралы тек төлем қадамында).

### Нәтижелер

MCP стиліндегі объектіні, қарапайым жолды немесе кез келген JSON мәнін қайтарыңыз:

```js
return { content: [{ type: "text", text: "Added 2 x Margherita to the order." }] };
return { content: [{ type: "text", text: "Size 'huge' does not exist. Try: small, medium, large." }], isError: true };
```

Оркестратор жауаптың мәтінін сақтайды (`content[].text` бөліктері, жол немесе соңғы амал ретінде JSON; 4000 таңбада қиылады) және оны кейінгі қадамдарда оқиды, мысалы іздеудің бірінші тауарын таңдау үшін. `isError: true` болғанда қадам сәтсіз саналады. Қате мәтінін кеңес ретінде жазыңыз: егер ол сіздің басқа құралыңыздың атын атаса («No store is open. Call `choose_store` first»), планировщик сол құралды іске қосып, қайталайды.

## Оркестратор құралды қалай оқиды

Оркестратор құралды сайтқа тән кодтан емес, оның **атауы мен схемасынан** түсінеді.

1. Панель ашылғанда виджет `getTools()` шақырады және каталогты тред үшін бір рет жібереді (бет `toolchange` іске қосып, каталог шынымен өзгерсе, оны қайта жібереді, 300 мс debounce-пен). Ол `name`, `description` және `inputSchema` (`type`, `properties`, `required`) жібереді.
2. Оркестратор әр құралды жіктейді. Алдымен **атау** шешеді: `add_to_cart`, `addToCart` және `add-to-cart` сөздері бірдей. `search_*`, `find_*`, `checkout`, `remove_*`, `get_*` сияқты аталған құрал етістігі бойынша танылады. Егер атау ештеңе шешпесе, шағын шешім моделі атауы мен сипаттамасы бойынша таңдайды. Категориялардың бүгін қандай екенін [Ниеттер](/docs/intents/) бөлімінен қараңыз.
3. Хабарлама үшін планировщик құралдарды және олардың ретін таңдайды. Бөлек шағын модель әр шақырудың аргументтерін сіздің схемаңыздан толтырады (enum мәндері, `required`, сипаттамалар).

Практикалық салдарлары:

- Түсінікті `verb_object` атауларын қолданыңыз. Атаудағы қосымша анықтауыштар (`add_to_cart` қасындағы `add_recipe_to_cart`) *мамандандырылған* құралды белгілейді: ол келуші оның enum мәндерінің бірін атағанда қолданылады, әйтпесе қарапайым құрал жеңеді.
- Келуші айта алатын таңдауларды схемада `enum` ретінде беріңіз. Әр параметрді `description` ішінде сипаттаңыз.
- Атауында `remove`, `delete`, `clear`, `empty` немесе `cancel` бар құрал жою ретінде, ал `checkout`, `pay`, `purchase` немесе `place` + `order` — төлем ретінде қарастырылады. Бұл екеуін модель ешқашан таңдамайды, сондықтан мұндай құралдарды шынайы атаңыз.
- Тек оқуға арналған құралдар (`get_`, `list_`, `view_`, `check_`, `status`, `history`) сайттың қазір нені ұстап тұрғанын планировщикке айтады, бұл «бәрі» туралы сұраныстар үшін маңызды.

### Каталог шектеулері

Каталог — `POST /v1/widget/tools` ([Widget API](/docs/api/widget/#POST--v1-widget-tools)). Сериализацияланған `webmcpTools` массиві әдепкіде ең көбі 20 000 таңба болуы мүмкін (`WIDGET_MAX_WEBMCP_TOOLS_CHARS`); көп болса `413` қайтады. Сипаттамаларды қысқа ұстаңыз.

## Әр түрлі салалардан мысалдар

### Онлайн-дүкен

```js
document.modelContext.registerTool({
  name: "add_to_cart",
  description: "Add a product to the cart.",
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string" },
      quantity: { type: "number", description: "Defaults to 1" },
    },
    required: ["productId"],
  },
  async execute({ productId, quantity = 1 }) {
    await cart.add(productId, quantity);
    return { content: [{ type: "text", text: `Added ${quantity} x ${productId}.` }] };
  },
});
```

Азық-түлік дүкені, электроника дүкені немесе киім дүкені үшін бірдей жұмыс істейді; тек атаулар мен сипаттамалар өзгереді.

### Қонақүйді брондау

```js
document.modelContext.registerTool({
  name: "search_rooms",
  description: "Find available rooms for a stay.",
  inputSchema: {
    type: "object",
    properties: {
      checkIn: { type: "string", description: "Date, YYYY-MM-DD" },
      checkOut: { type: "string", description: "Date, YYYY-MM-DD" },
      guests: { type: "number" },
      roomType: { type: "string", enum: ["single", "double", "suite"] },
    },
    required: ["checkIn", "checkOut", "guests"],
  },
  async execute(args) {
    const rooms = await hotel.availability(args);
    if (rooms.length === 0) {
      return { isError: true, content: [{ type: "text", text: "No rooms free on those dates. Try other dates." }] };
    }
    return { content: [{ type: "text", text: rooms.map((r) => `- ${r.id}: ${r.type}, $${r.rate}/night`).join("\n") }] };
  },
});

document.modelContext.registerTool({
  name: "book_room",
  description: "Reserve a room found by search_rooms.",
  inputSchema: {
    type: "object",
    properties: { roomId: { type: "string" }, guestName: { type: "string" } },
    required: ["roomId", "guestName"],
  },
  async execute(args) { /* ... */ },
});
```

### Пицца конструкторы

```js
document.modelContext.registerTool({
  name: "set_pizza_size",
  description: "Set the size of the pizza being built.",
  inputSchema: {
    type: "object",
    properties: { size: { type: "string", enum: ["small", "medium", "large"] } },
    required: ["size"],
  },
  async execute({ size }) {
    builder.setSize(size);
    return { content: [{ type: "text", text: `Size is now ${size}.` }] };
  },
});

document.modelContext.registerTool({
  name: "add_topping",
  description: "Add a topping to the pizza.",
  inputSchema: {
    type: "object",
    properties: { topping: { type: "string", enum: ["mushrooms", "olives", "pepperoni", "basil"] } },
    required: ["topping"],
  },
  async execute({ topping }) { builder.addTopping(topping); return "ok"; },
});
```

<!-- TODO: today the planner's built-in categories describe an online shop (see Intents). A tool like set_pizza_size has no matching category and is classified "other"; whether such a tool can be the goal of a plan on a channel without an intent pack is planned work (PO-41), not verified current behaviour. -->

### Декларативті форма

Форма JavaScript-сіз де құрал бола алады. Polyfill `toolname`, `tooldescription` және `toolparamdescription` атрибуттарын оқиды және схеманы форма өрістерінен құрады (`required` өрістер `required` болады; `<select>` `enum` болады):

```html
<form toolname="request_callback" tooldescription="Ask the clinic to call the visitor back." toolautosubmit>
  <input name="phone" required toolparamdescription="Phone number to call" />
  <select name="topic" toolparamdescription="What the call is about">
    <option>appointment</option>
    <option>results</option>
  </select>
  <button type="submit">Send</button>
</form>
```

`toolautosubmit` болмаса, polyfill өрістерді толтырады да, келушінің жіберуін күтеді.

## Құрал қателері

Құрал екі жолмен сәтсіз бола алады.

- **Оны нәтиже ретінде хабарлау.** `{ isError: true, content: [{ type: "text", text: "..." }] }` қайтарыңыз. Жұмыс жалғасады: қадам сәтсіз болады, ал мәтін сайттың жауабы ретінде сақталады. Егер жұмыс мақсатқа жете алмаса, ағын `error` / `task_failed` арқылы аяқталады, ал сайттың соңғы жауабы `hint` ретінде беріледі (ең көбі 400 таңба), оны виджет келушіге көрсетеді.
- **Қате лақтыру.** Polyfill-де сандық `status` (100-599) және міндетті емес `retryAfter` (секундтар, сан немесе сандық жол) бар лақтырылған қате шақыру терезелер арасынан өткенде екеуін де сақтайды (`WEBMCP_EXECUTE_TOOL_RESPONSE`); сұраушы терезе оларды қайта тексереді және сол өрістері бар қатені қайта лақтырады. Мұны жылдамдық шектеуін білдіру үшін қолданыңыз:

```js
async execute(args) {
  const res = await fetch("/api/search?q=" + encodeURIComponent(args.query));
  if (res.status === 429) {
    throw Object.assign(new Error("Search is rate limited"), {
      status: 429,
      retryAfter: Number(res.headers.get("retry-after") ?? 30),
    });
  }
  // ...
}
```

<!-- TODO: `status`/`retryAfter` are carried by the polyfill's cross-window bridge only. In chat.ts the widget's own tool call (`webmcp.callTool`) is not wrapped in try/catch, and nothing in the orchestrator reads `status` or `retryAfter`; a tool that throws on the same page appears to end the turn as a generic failure. Confirm intended behaviour before documenting it as a guarantee. Prefer returning `isError: true` for errors the planner should react to. -->

## Annotations

`annotations` (мысалы, WebMCP ұсынысындағы `{ readOnlyHint: true }`) `registerTool` арқылы қабылданады, polyfill сақтайды және құралдарыңызды тізімдейтін басқа терезелерге беріледі. Виджет annotations мәндерін оркестраторға жібермейді: ол тек `name`, `description` және `inputSchema` жібереді, ал сервердің сұраныс схемасы басқа өрістерді алып тастайды. Бүгін annotations жоспарлауға әсер етпейді.

## Басқа терезелердегі құралдар

Әдепкіде polyfill құралдарыңызды басқа терезелерге ашпайды. Ендірілген бетке, opener-ге немесе iframe-ге осы беттің құралдарын `postMessage` арқылы тізімдеуге және іске қосуға рұқсат беру үшін, олардың origin-дерін виджетте көрсетіңіз:

```html
<pleiades-chat agent-url="..." publishable-key="pk_..." expose-tools-to="https://shop.example,https://pay.example"></pleiades-chat>
```

Жауаптар әрқашан сұраушының origin-іне жолданады, ешқашан `*`-ге емес. Бұл тек құралдарды хостайтын бетке керек. `<iframe allow="tools" src="...">` ішінен құралдарды тұтынатын бетке керек емес.

## Polyfill

`@repo/webmcp-polyfill` (Apache-2.0, Google-дың `webmcp-tools` polyfill-інен бейімделген) виджетке кіріктірілген; виджет оны жүктелгенде орнатады. Ол `document.modelContext` объектісін тек жоқ жерде анықтайды, сондықтан браузерде нативті WebMCP болса, сол қолданылады. Ол `registerTool`, `getTools`, `executeTool`, `toolchange`, `toolactivated` және `toolcancel` оқиғаларын, декларативті форма құралдарын және терезелер арасындағы көпірді береді. Оны бөлек орнатудың қажеті жоқ. Виджет оны жүктелгенде орнатады, сондықтан виджеті бар бетте ештеңе істеудің қажеті жоқ.

Полифилді виджетсіз пайдалану үшін оны виджет пакетінен импорттаңыз. Импорт ештеңені тіркемейді, функцияны өзіңіз шақырасыз:

```js
import { installWebMcpPolyfill } from "@shalotts/pleiades-widget/webmcp-polyfill";

installWebMcpPolyfill({ exposeToolsTo: ["https://embedder.example"] });
```

Параметрлер виджеттің `expose-tools-to` атрибутындағыдай.
