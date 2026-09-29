# Как написать свой GOAP action

Практический гайд по `packages/core/src/goap/`. Для контекста дизайна/фаз см. `CLAUDE.md`
(секция «GOAP code…») — этот файл про механику: как создать action и как это работает под капотом.

## Как создать action

1. Реши, какие факты в `WorldState` action читает (`preconditions`) и какие производит
   (`effects`) — это ключ-значение, например `{ catalogOpen: true }` или `{ filterSet: "price_asc" }`.
2. Напиши функцию, которая возвращает объект `GoapAction`, и вынеси её рядом с остальными
   actions (например, `apps/alpha-orchestrator/src/actions/`).
3. Зарегистрируй её в каталоге — добавь вызов в `buildActions()`
   (`apps/alpha-orchestrator/src/server.ts`).

Минимальный рабочий пример — action, который открывает каталог товаров через WebMCP:

```ts
// apps/alpha-orchestrator/src/actions/open-catalog.ts
import type { ActionContext, GoapAction } from "@repo/core";
import type { WebMcpClient } from "../webmcp-client";

export function createOpenCatalogAction(webmcp: WebMcpClient): GoapAction {
  return {
    name: "openCatalog",
    cost: 1, // реальная цена вызова — латентность/CPU, не произвольное число
    preconditions: {},
    effects: { catalogOpen: true },
    async execute(_ctx: ActionContext) {
      const result = await webmcp.callTool("catalog.open", {});
      return { catalogOpen: result.ok };
    },
  };
}
```

И регистрация:

```ts
// apps/alpha-orchestrator/src/server.ts, внутри buildActions(deps)
function buildActions(deps: ServerDeps): GoapAction[] {
  return [
    createTextAction({ /* ... существующий generateReply ... */ }),
    createOpenCatalogAction(deps.webmcp),
  ];
}
```

Планировщику (`plan()`) не нужно явно указывать порядок вызовов — он сам построит цепочку
из `preconditions`/`effects` действий, подбирая самую дешёвую (`cost`) последовательность до
цели (`goal`). Дальше — зачем это так устроено и что ещё можно сделать с actions.

## Модель

- `WorldState` (`packages/core/src/goap/types.ts`) — плоский key→value мешок фактов
  (`Record<string, boolean | number | string | undefined>`), не граф.
- `Goal` — `Partial<WorldState>`: подмножество фактов, которых планировщик пытается достичь.
- `GoapAction` — единица, которую понимает планировщик:

```ts
interface GoapAction {
  name: string;
  cost: number; // реальная цена (латентность/CPU), не произвольное число
  preconditions: Partial<WorldState>;
  effects: Partial<WorldState>; // что action ОБЕЩАЕТ на этапе планирования
  execute(ctx: ActionContext): Promise<Partial<WorldState>>; // что реально произошло
}
```

`plan()` (`plan.ts`) делает backward-chaining поиск от `goal` к `state`, перебирая
`preconditions`/`effects` — это чистый STRIPS-поиск, никакой модели тут нет. `runPlan()`
(`executor.ts`) исполняет найденный план по шагам и **сверяет** обещанные `effects` с реально
вернувшимися из `execute()` — если execute() вернул не то, что ожидалось, это повод для
реплана, а не для того, чтобы планировщик соврал сам себе.

Важно: `effects` — это план-тайм обещание ("после этого action `filterSet` станет `"price_asc"`"),
а то, что реально возвращает `execute()`, может отличаться (ошибка тула, отказ модели,
недоступный сайт). Планировщик за это не отвечает — это забота `runPlan`.

## Три способа получить `GoapAction`

| Способ | Когда использовать |
| --- | --- |
| Написать `GoapAction` руками (пример выше) | Детерминированная бизнес-логика (HTTP-вызов, WebMCP tool, чистая функция) |
| `createTextAction` (`text-action.ts`) | Шаг, который должен сгенерировать текст через `Agent`/albedo |
| `createDecisionAction` (`decision-action.ts`) | Единичный типизированный вопрос к Laya (choice/score/noul) с калиброванной вероятностью |
| `createMcpToolSource` (`tool-source.ts`) | Автоматически завести actions из `tools/list` реального MCP-сервера — без ручного конфига на каждый тул |

## Пример посложнее: цепочка из нескольких actions

Сценарий: «выбрать самый дешёвый ноутбук и положить в корзину». Соседний с `openCatalog`
action задаёт сортировку по цене — требует, чтобы каталог уже был открыт:

```ts
export function createSetPriceFilterAction(webmcp: WebMcpClient): GoapAction {
  return {
    name: "setPriceFilterAsc",
    cost: 2,
    preconditions: { catalogOpen: true },
    effects: { filterSet: "price_asc" },
    async execute(ctx: ActionContext) {
      const result = await webmcp.callTool("catalog.setFilter", {
        sort: "price",
        order: "asc",
      });
      // Реальный исход может отличаться от обещанного effects — например,
      // сайт не поддержал сортировку и откатился на дефолтную.
      if (!result.ok) return { filterSet: undefined };
      return { filterSet: "price_asc" };
    },
  };
}
```

Третий action читает первый элемент отфильтрованного списка и кладёт его в корзину:
`preconditions: { filterSet: "price_asc" }`, `effects: { inCart: true }`. Для цели
`{ inCart: true }` планировщик сам выведет цепочку
`openCatalog → setPriceFilterAsc → addCheapestToCart` — точно так же, как в `plan.test.ts`
цепочка `classifyIntent → generateReply` выводится из того, что `generateReply` требует
`intent`, которого `classifyIntent` не требует ни от чего.

## `ActionContext`

`execute(ctx)` получает `BaseContext` (то, что вызывающий передал в `runPlan({ ctx })` —
`threadId`, HTTP-клиенты и т.п.) плюс живой `state`: не тот `state`, с которым начался прогон,
а тот, что реально сложился к моменту исполнения именно этого action (эффекты предыдущих шагов
уже применены). `plan()` сам этого `state` не видит и не трогает — только `execute()`.

## Тестирование

Actions тестируются юнит-тестами рядом с файлом (`*.test.ts`, `bun test`), без реального
планировщика — см. `plan.test.ts` для паттерна тестового фикстура (`execute: async () => ({})`,
т.к. `plan()` его не вызывает вовсе) и `decision-action.test.ts`/`text-action.test.ts` для того,
как тестировать сам `execute()` с фейковыми портами (`DecisionAgent`/`Agent`).

## Регистрация в каталоге

Actions собираются один раз на инстанс приложения, не на каждый запрос — см.
`buildActions()` в `apps/alpha-orchestrator/src/server.ts`. Новый action добавляется туда же
(или в отдельный `buildWebMcpActions()`, который `buildActions()` конкатенирует), а не создаётся
заново при каждом вызове `/v1/messages`.

---

> `docs/harness-goap-orchestrator-plan.md`, на который раньше ссылался CLAUDE.md, был
> случайно удалён в коммите `0bfd211`. Этот файл его не заменяет целиком — только
> практическую часть про написание actions.
