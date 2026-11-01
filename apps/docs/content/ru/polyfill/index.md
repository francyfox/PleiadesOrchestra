---
title: Полифил
lang: ru
---

# Полифил WebMCP

WebMCP (`document.modelContext`) есть пока не во всех браузерах. Виджет несёт полифил, поэтому [инструменты](/docs/tools/) вашего сайта работают в любом браузере.

## Что он делает

`@repo/webmcp-polyfill` (Apache-2.0, адаптирован из полифила `webmcp-tools` от Google) встроен в виджет; виджет устанавливает его при загрузке. Он определяет `document.modelContext` только там, где его нет, поэтому в браузерах с нативным WebMCP используется нативная реализация. Он предоставляет `registerTool`, `getTools`, `executeTool`, события `toolchange`, `toolactivated` и `toolcancel`, декларативные инструменты-формы и мост между окнами. Виджет устанавливает его при загрузке, поэтому на странице с виджетом ничего делать не нужно.

## Использование без виджета

Чтобы использовать полифил без виджета, импортируйте его из пакета виджета. Импорт ничего не регистрирует, функцию вызываете сами:

```js
import { installWebMcpPolyfill } from "@shalotts/pleiades-widget/webmcp-polyfill";

installWebMcpPolyfill({ exposeToolsTo: ["https://embedder.example"] });
```

Параметры те же, что у атрибута виджета `expose-tools-to` (см. [Инструменты в других окнах](/docs/tools/#Tools-in-other-windows)). Повторный вызов безопасен: существующий `document.modelContext` он не заменяет, но обновляет список `exposeToolsTo`.
