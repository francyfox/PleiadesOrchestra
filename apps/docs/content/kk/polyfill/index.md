---
title: Polyfill
lang: kk
---

# WebMCP polyfill

WebMCP (`document.modelContext`) әлі барлық браузерде жоқ. Виджет polyfill әкеледі, сондықтан сайттың [құралдары](/docs/tools/) кез келген браузерде жұмыс істейді.

## Ол не істейді

`@repo/webmcp-polyfill` (Apache-2.0, Google-дың `webmcp-tools` polyfill-інен бейімделген) виджетке кіріктірілген; виджет оны жүктелгенде орнатады. Ол `document.modelContext` объектісін тек жоқ жерде анықтайды, сондықтан браузерде нативті WebMCP болса, сол қолданылады. Ол `registerTool`, `getTools`, `executeTool`, `toolchange`, `toolactivated` және `toolcancel` оқиғаларын, декларативті форма құралдарын және терезелер арасындағы көпірді береді. Оны бөлек орнатудың қажеті жоқ. Виджет оны жүктелгенде орнатады, сондықтан виджеті бар бетте ештеңе істеудің қажеті жоқ.

## Виджетсіз қолдану

Полифилді виджетсіз пайдалану үшін оны виджет пакетінен импорттаңыз. Импорт ештеңені тіркемейді, функцияны өзіңіз шақырасыз:

```js
import { installWebMcpPolyfill } from "@shalotts/pleiades-widget/webmcp-polyfill";

installWebMcpPolyfill({ exposeToolsTo: ["https://embedder.example"] });
```

Параметрлер виджеттің `expose-tools-to` атрибутындағыдай (қараңыз: [Басқа терезелердегі құралдар](/docs/tools/#Tools-in-other-windows)). Қайта шақыру қауіпсіз: бар `document.modelContext` ауыстырылмайды, бірақ `exposeToolsTo` тізімі жаңарады.
