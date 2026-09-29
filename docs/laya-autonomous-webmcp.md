# Laya-автопилот для произвольного WebMCP

Дизайн-заметка: как довести Laya до автономности уровня Jev на **любом** WebMCP-каталоге —
без ручного action на конкретный тул конкретного магазина, и без потери того, ради чего вообще
нужен GOAP (граф из действий, а не чёрный ящик). Продолжение `docs/goap-actions.md` — сначала
прочитай его, тут не повторяется базовая модель `WorldState`/`GoapAction`/`plan`/`runPlan`.

## WebMCP vs MCP: где на самом деле исполняется вызов тула

Решено (2026-09-29, сессия про stop-кнопку/офлайн/рестайл виджета): у нас это **два разных
транспорта**, не один и тот же каталог тулов, доступный двумя путями.

- **MCP** — тулы сайта доступны через настоящий MCP-сервер (stdio/SSE), до которого достаёт сам
  `alpha-orchestrator`. Вся схема этого документа (`createClassifiedMcpToolSource`, `McpClient`,
  классификация на этапе построения каталога) — про этот случай. Сервер сам решает, какой тул
  вызвать, и сам его вызывает — GOAP-планировщик видит реальный граф.
- **WebMCP** — тулы существуют только в браузере посетителя, через `navigator.modelContext` на
  странице, где встроен виджет. Здесь **вызов инструмента исполняется в браузере, самим
  виджетом** (`navigator.modelContext.callTool(...)`), а не через relay на сервер. Это значит,
  что схема с `McpClient`/`createClassifiedMcpToolSource` из этого документа **не покрывает
  WebMCP-режим как есть** — нужен отдельный дизайн для того, как сервер (GOAP-планировщик)
  говорит виджету, что вызвать, и как виджет возвращает результат обратно в `WorldState` прогона.
  Это пока не спроектировано и не реализовано — есть только сам переключатель режима в UI
  виджета (`chat.ts`'s `toolMode`/`setToolMode`, `ui/mode-switch.tsx`), без реальной логики за
  ним ни на одной из сторон.

## Почему нельзя просто писать action на каждый тул

Пример из `goap-actions.md` (`createSetPriceFilterAction`, жёстко зовёт
`webmcp.callTool("catalog.setFilter", ...)`) работает только для одного конкретного сайта с
одним конкретным набором tools. Другой магазин может звать это `products.sort`, третий —
вообще не иметь сортировки. Писать по action на тул на магазин не масштабируется — а `plan()`
в принципе не может вывести "открыть каталог раньше фильтра" сам, потому что у MCP tool
descriptor нет семантики зависимостей — только `name`/`description`/`inputSchema` (см.
`McpToolDescriptor` в `tool-source.ts`). Это то, что за нас обычно решает LLM-агент вроде Jev:
читает описания тулов на естественном языке и *рассуждает*, что вызвать дальше. Laya
рассуждать не может — она отвечает только на **типизированный** вопрос с заранее
перечисленными вариантами (`choice`/`score`/`noul`, `packages/core/src/decision-types.ts`),
никакой свободной генерации и никакого пошагового планирования.

## Отвергнутый вариант: один "автопилот"-action

Первая версия этой заметки предлагала один universal `GoapAction`, который сам внутри
`execute()` на каждой итерации `runPlan`'s replanning спрашивал Laya "какой тул вызвать
дальше" по живому `listTools()`, с `effects: goal` (обещание равно самой цели, поэтому
`plan()` тривиально выбирает этот единственный action). Это работало бы, но убивало саму суть
GOAP:

- **Граф пропадает** — `plan()` видит один action на любую цель, реальная последовательность
  тулов скрыта внутри `execute()`, невидима планировщику.
- **`cost` перестаёт что-то значить** — весь смысл GOAP-модели в том, что планировщик
  сравнивает цену разных путей (дешёвая Laya vs дорогой albedo). Один action с одним статичным
  `cost` не даёт сравнивать варианты внутри самого похода по магазину.
- **Трейсинг деградирует** — `PlanTraceEvent` показывал бы один и тот же `action_started`
  N раз подряд вместо реальной цепочки `openCatalog → setFilter → addToCart`.
- **Нельзя смешивать** с обычными Laya/text actions в одном плане.

## Правильная декомпозиция: Laya как классификатор каталога, не как оркестратор шагов

Вместо того чтобы спрашивать Laya "что делать дальше" на каждом шаге исполнения — спрашиваем
её **один раз на тул, при построении каталога**, к какой из небольшого фиксированного набора
e-commerce-категорий он относится. Это ровно та bounded-задача, которую Laya калибровано
решает (готовый список вариантов, не открытое рассуждение), а не то, для чего она не годится.
Результат классификации — это уже настоящие `preconditions`/`effects`, с которыми `plan()`
строит реальный граф, для любого магазина, без единой строчки, специфичной под конкретный сайт.

```ts
// packages/core/src/goap/webmcp-tool-classifier.ts (предложение, не реализовано)
import type { DecisionAgent } from "../decision-types";
import type { ActionContext, GoapAction, WorldState } from "./types";
import type { McpClient, McpToolDescriptor, ToolSource } from "./tool-source";

const TOOL_INTENTS = [
  "search",
  "filter",
  "select",
  "addToCart",
  "removeFromCart",
  "checkout",
  "paginate",
  "compare",
  "other",
] as const;
type ToolIntent = (typeof TOOL_INTENTS)[number];

/** Единственное место, где живёт доменная семантика "магазин" — не в тулах, не в Laya. */
const EFFECTS_BY_INTENT: Record<ToolIntent, Partial<WorldState>> = {
  search: { catalogSearched: true },
  filter: { catalogFiltered: true },
  select: { itemSelected: true },
  addToCart: { inCart: true },
  removeFromCart: { inCart: false },
  checkout: { checkoutComplete: true },
  paginate: {},
  compare: {},
  other: {},
};

/** Эвристика порядка — best-effort, не гарантия (см. «Ограничения» ниже). */
const PRECONDITIONS_BY_INTENT: Record<ToolIntent, Partial<WorldState>> = {
  search: {},
  filter: { catalogSearched: true },
  select: {},
  addToCart: { itemSelected: true },
  removeFromCart: {},
  checkout: { inCart: true },
  paginate: {},
  compare: {},
  other: {},
};

export interface ClassifiedMcpToolSourceConfig {
  client: McpClient;
  decisionAgent: DecisionAgent;
  costFor?: (tool: McpToolDescriptor) => number;
}

/**
 * Как `createMcpToolSource`, но каждый тул получает содержательные
 * preconditions/effects через один Laya `choice`-вызов на тул (не на шаг
 * плана) вместо generic `{ toolResult:<name>: true }`.
 */
export function createClassifiedMcpToolSource(
  config: ClassifiedMcpToolSourceConfig,
): ToolSource {
  const costFor = config.costFor ?? (() => 3);

  return {
    async listActions() {
      const { tools } = await config.client.listTools();

      return Promise.all(
        tools.map(async (tool): Promise<GoapAction> => {
          const answers = await config.decisionAgent.decide(
            { name: tool.name, description: tool.description ?? "" },
            {
              intent: {
                type: "choice",
                instructions:
                  "Which e-commerce action does this tool most likely perform?",
                criteria: TOOL_INTENTS,
              },
            },
          );
          const intent =
            answers.intent?.type === "choice"
              ? (answers.intent.choice as ToolIntent)
              : "other";

          return {
            name: tool.name,
            cost: costFor(tool),
            preconditions: PRECONDITIONS_BY_INTENT[intent],
            effects: {
              ...EFFECTS_BY_INTENT[intent],
              [`toolResult:${tool.name}`]: true,
            },
            async execute(ctx: ActionContext) {
              const args = buildArguments(ctx.state, tool.inputSchema); // как в tool-source.ts
              const result = await config.client.callTool({
                name: tool.name,
                arguments: args,
              });
              if (result.isError) return { [`toolResult:${tool.name}`]: false };
              return {
                ...EFFECTS_BY_INTENT[intent],
                [`toolResult:${tool.name}`]: true,
              };
            },
          };
        }),
      );
    },
  };
}
```

Классификация выполняется один раз при построении каталога (или при обновлении списка тулов
сайта), не на каждом шаге плана — дёшево, кэшируется по `name`+`description`. Дальше это
обычные `GoapAction`, ничем не отличающиеся от ручных из `goap-actions.md`: `plan()` строит
для них настоящий backward-chaining граф вперемешку с Laya/text actions, `runPlan` их
исполняет и реплэнит по факту, трейсер видит реальную последовательность тулов.

## Аргументы тула: bounded vs open

Это не изменилось относительно первой версии. `buildArguments` берёт значение параметра из
`WorldState` по совпадению имени — покрывает параметры, значение которых уже известно
(например, `budget`, извлечённый раньше отдельным action). Для параметров с `enum` в JSON
Schema, которых ещё нет в `WorldState`, можно задать Laya отдельный `score`/`choice`-подвопрос
с вариантами прямо из `enum` в `execute()` — тоже bounded, работает одинаково на любом сайте,
потому что enum приходит из `inputSchema`, а не захардкожен.

Свободнотекстовые параметры без `enum` и без соответствия в `WorldState` (например: "сформулируй
поисковый запрос") — граница, где чистая Laya не работает по конструкции. Это осознанная точка
эскалации к albedo/Jev (отдельный `createTextAction`, который заполняет нужный факт в
`WorldState` до того, как соответствующий tool-action до него дойдёт), а не что-то, что нужно
имитировать через Laya.

## Ограничения

- **Preconditions — эвристика, не гарантия.** В отличие от `effects` (что тул, скорее всего,
  производит — относительно надёжно выводится из описания), правильный *порядок* вызовов
  угадать сложнее: `PRECONDITIONS_BY_INTENT` — общий шаблон "по умолчанию для категории", не
  факт про конкретный сайт. Если план выберет не тот порядок — система не падает: реальный
  вызов тула просто вернёт ошибку/не тот effect, `runPlan`'s replanning уже это обрабатывает
  (см. `executor.ts`) — но ценой одного лишнего вызова тула, не бесплатно.
- **Фиксированный таксон** (`TOOL_INTENTS`) — общий для e-commerce, но не универсальный: тул,
  не подходящий ни под одну категорию, падает в `"other"` с пустыми effects (для планировщика
  бесполезен, доступен только если сам является целью через `toolResult:<name>`). Расширять
  список под новый домен — осознанное решение, не автоматика.
- **MCP tool annotations** (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`,
  стандартная часть MCP tool descriptor) сюда ещё не подмешаны, но должны — они дают
  Laya дополнительный сигнал без специфики конкретного сайта (например, `destructiveHint`
  скоррелирован с `checkout`/`removeFromCart`) и не требуют новой инфраструктуры, только
  добавление в `state`, который видит `decide()`.
