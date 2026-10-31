---
title: Инструменты
lang: ru
---

# Предоставление инструментов со стороны сайта

Оркестратор ничего не знает о вашем сайте, кроме инструментов, которые вы ему даёте. **Инструмент** — это функция, которая выполняется в браузере посетителя: поиск по каталогу, добавление номера в бронирование, выбор размера пиццы, открытие заказа. Вы регистрируете инструменты через [WebMCP](https://github.com/webmachinelearning/webmcp) (`document.modelContext`); виджет читает их, а оркестратор строит план вокруг них.

## Регистрация инструмента

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

| Поле | Обязательно | Примечания |
| --- | --- | --- |
| `name` | да | Соответствует `^[a-zA-Z0-9_.-]{1,128}$`. Уникально на странице; повторная регистрация имени выбрасывает исключение. |
| `description` | да | Непустая строка. |
| `inputSchema` | нет | JSON Schema с `type: "object"`, `properties` и, при необходимости, `required`. Должна сериализоваться в JSON. |
| `execute(args, options)` | да, чтобы инструмент можно было вызвать | Получает объект с аргументами. Возвращает результат (см. ниже). |
| `annotations` | нет | Сохраняются полифилом. См. [Аннотации](#Annotations). |

`registerTool` также принимает `{ signal }` вторым аргументом; прерывание сигнала снимает инструмент с регистрации. Регистрируйте и снимайте с регистрации свободно: каталог страницы может меняться вместе с её состоянием (инструмент корзины — только пока корзина существует, инструмент оформления заказа — только на шаге оформления).

### Результаты

Возвращайте объект в стиле MCP, обычную строку или любое JSON-значение:

```js
return { content: [{ type: "text", text: "Added 2 x Margherita to the order." }] };
return { content: [{ type: "text", text: "Size 'huge' does not exist. Try: small, medium, large." }], isError: true };
```

Оркестратор сохраняет текст ответа (части `content[].text`, строку или, в крайнем случае, JSON; обрезается до 4000 символов) и читает его на следующих шагах, например чтобы выбрать первый товар из результатов поиска. С `isError: true` шаг считается неудачным. Пишите текст ошибки как совет: если в нём назван другой ваш инструмент («Магазин не открыт. Сначала вызовите `choose_store`»), планировщик запустит этот инструмент и повторит попытку.

## Как оркестратор читает инструмент

Оркестратор понимает инструмент по его **имени и схеме**, а не по коду, специфичному для сайта.

1. Когда панель открывается, виджет вызывает `getTools()` и один раз для треда отправляет каталог (он отправляет его повторно, с задержкой (debounce) 300 мс, когда страница вызывает `toolchange` и каталог действительно изменился). Отправляются `name`, `description` и `inputSchema` (`type`, `properties`, `required`).
2. Оркестратор классифицирует каждый инструмент. Сначала решает **имя**: слова в `add_to_cart`, `addToCart` и `add-to-cart` одинаковы. Инструмент с именем вроде `search_*`, `find_*`, `checkout`, `remove_*`, `get_*` распознаётся по глаголу. Если имя ничего не решает, небольшая модель решений выбирает по имени и описанию. О том, какие сегодня существуют категории, см. [Намерения](/docs/intents/).
3. Для сообщения планировщик выбирает инструменты и их порядок. Отдельная небольшая модель заполняет аргументы каждого вызова по вашей схеме (значения enum, `required`, описания).

Практические следствия:

- Используйте понятные имена вида `verb_object`. Дополнительные уточнения в имени (`add_recipe_to_cart` рядом с `add_to_cart`) помечают *специалиста*: он используется, когда посетитель называет одно из его значений enum, а в остальных случаях выигрывает обычный инструмент.
- Помещайте в схему в виде `enum` варианты, которые может назвать посетитель. Описывайте каждый параметр в `description`.
- Имя, содержащее `remove`, `delete`, `clear`, `empty` или `cancel`, считается удалением; `checkout`, `pay`, `purchase` или `place` + `order` — оформлением заказа. Эти два вида модель никогда не выбирает сама, поэтому называйте такие инструменты честно.
- Инструменты только для чтения (`get_`, `list_`, `view_`, `check_`, `status`, `history`) сообщают планировщику, что сейчас хранит сайт; это важно для запросов про «всё».

### Ограничения каталога

Каталог отправляется через `POST /v1/widget/tools` ([Widget API](/docs/api/widget/#POST--v1-widget-tools)). Сериализованный массив `webmcpTools` по умолчанию может занимать не более 20 000 символов (`WIDGET_MAX_WEBMCP_TOOLS_CHARS`); при превышении возвращается `413`. Делайте описания короткими.

## Примеры из разных предметных областей

### Интернет-магазин

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

Подходит и для продуктового магазина, и для магазина электроники, и для магазина одежды; различаются только имена и описания.

### Бронирование отеля

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

### Конструктор пиццы

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

### Декларативная форма

Форма может быть инструментом без JavaScript. Полифил читает `toolname`, `tooldescription` и `toolparamdescription` и строит схему по полям формы (обязательные поля становятся `required`; `<select>` становится `enum`):

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

Без `toolautosubmit` полифил заполняет поля и ждёт, пока посетитель отправит форму.

## Ошибки инструментов

Инструмент может завершиться ошибкой двумя способами.

- **Сообщить об ошибке как о результате.** Верните `{ isError: true, content: [{ type: "text", text: "..." }] }`. Запуск продолжается: шаг помечается как неудачный, а текст сохраняется как ответ сайта. Если запуск не может достичь цели, поток завершается `error` / `task_failed`, а последний ответ сайта передаётся в `hint` (не более 400 символов), и виджет показывает его посетителю.
- **Выбросить исключение.** В полифиле выброшенная ошибка с числовым `status` (100-599) и необязательным `retryAfter` (секунды, число или числовая строка) сохраняет оба поля при передаче вызова между окнами (`WEBMCP_EXECUTE_TOOL_RESPONSE`); запрашивающее окно повторно проверяет их и выбрасывает ошибку с теми же полями. Используйте это, чтобы сигнализировать об ограничении частоты запросов:

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

## Аннотации

`annotations` (например, `{ readOnlyHint: true }` из предложения WebMCP) принимаются `registerTool`, сохраняются полифилом и передаются другим окнам, которые запрашивают список ваших инструментов. Виджет не пересылает аннотации оркестратору: он отправляет только `name`, `description` и `inputSchema`, а схема запроса на сервере отбрасывает остальные поля. Сегодня аннотации на планирование не влияют.

## Инструменты в других окнах

По умолчанию полифил не открывает ваши инструменты ни одному другому окну. Чтобы позволить встраивающей странице, открывшему окну (opener) или iframe получать список инструментов этой страницы и запускать их через `postMessage`, перечислите их origin'ы в виджете:

```html
<pleiades-chat agent-url="..." publishable-key="pk_..." expose-tools-to="https://shop.example,https://pay.example"></pleiades-chat>
```

Ответы всегда адресуются origin'у того, кто спросил, а не `*`. Это нужно только странице, на которой размещены инструменты. Странице, которая потребляет инструменты из `<iframe allow="tools" src="...">`, это не нужно.

## Полифил

`@repo/webmcp-polyfill` (Apache-2.0, адаптирован из полифила `webmcp-tools` от Google) встроен в виджет; виджет устанавливает его при загрузке. Он определяет `document.modelContext` только там, где его нет, поэтому в браузерах с нативным WebMCP используется нативная реализация. Он предоставляет `registerTool`, `getTools`, `executeTool`, события `toolchange`, `toolactivated` и `toolcancel`, декларативные инструменты-формы и мост между окнами. Виджет устанавливает его при загрузке, поэтому на странице с виджетом ничего делать не нужно.

Чтобы использовать полифил без виджета, импортируйте его из пакета виджета. Импорт ничего не регистрирует, функцию вызываете сами:

```js
import { installWebMcpPolyfill } from "@shalotts/pleiades-widget/webmcp-polyfill";

installWebMcpPolyfill({ exposeToolsTo: ["https://embedder.example"] });
```

Параметры те же, что у атрибута виджета `expose-tools-to`.
