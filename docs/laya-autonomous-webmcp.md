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
  что схема с `McpClient`/`createClassifiedMcpToolSource` из этого документа не покрывает
  WebMCP-режим как есть — реализовано отдельно, `createWebMcpActions`
  (`packages/core/src/goap/webmcp-actions.ts`), см. следующий раздел.

## WebMCP: раунд-трип с браузером (реализовано, 2026-09-29)

Развязка вопроса «сервер решил, что нужен браузерный тул — как получить результат обратно в тот
же прогон» — один HTTP NDJSON-стрим не может быть двунаправленным. Решение: **WAITING + новый
запрос**, тот же принцип, что Embabel называет состоянием `WAITING` агент-процесса (см. раздел
про gaps 2–6 в истории проекта) — прогон не падает и не зависает, а сохраняет чекпойнт и ждёт
следующего HTTP-запроса с результатом.

- **`WaitingOn`** (`packages/core/src/goap/types.ts`) — новый исход `GoapAction.execute()`:
  `Promise<Partial<WorldState> | { waiting: WaitingOn }>`. Действие, которое не может завершиться
  на сервере, возвращает `{ waiting: { kind, payload } }` вместо эффектов. `executor.ts` останавливает
  прогон немедленно (не бросает исключение, не считается `killed`/`no_plan` — отдельное поле
  `RunPlanResult.waiting`), эмитит `PlanTraceEvent` типа `"waiting"`.
- **`createWebMcpActions`** (`packages/core/src/goap/webmcp-actions.ts`) — превращает список
  тулов в `GoapAction[]`: классифицирует каждый тул один раз через Laya `choice`
  (`TOOL_INTENTS`/`EFFECTS_BY_INTENT`/`PRECONDITIONS_BY_INTENT`, `intent-taxonomy.ts` — та же
  таксономия, что предлагалась для `createClassifiedMcpToolSource` выше). `execute()` **никогда
  сам ничего не вызывает**: если `ctx.state["webmcp:<name>:result"]` уже есть (браузер уже ответил,
  записано при резюмировании) — возвращает реальные эффекты; иначе —
  `{ waiting: { kind: "webmcp_tool_call", payload: { tool, arguments } } }`. Вызывается не на
  каждый запрос, а один раз на регистрацию каталога (`POST /v1/widget/tools`, см. следующий
  раздел) — результат кэшируется по `threadId`.
- **`WorldStateCheckpoint`** (`packages/core/src/goap/world-state-store.ts`) — стор теперь хранит
  не только `state`, но и `goal` прогона (`thread_world_state.goal`, миграция
  `0005_thread_world_state_goal`). Нужно, чтобы резюмирование продолжало **ту же самую** цель, а
  не переклассифицировало исходное сообщение заново (Laya не гарантированно детерминирована).
- **Протокол** (`apps/alpha-orchestrator`, `docs/admin-api.md` — там же контракт целиком): NDJSON
  получает терминальную строку `tool_call` (вместо `done`/`error`) с `tool`/`arguments`/`callId`;
  новый эндпоинт `POST /v1/widget/tool-results` резюмирует прогон, подмешивая
  `webmcp:<tool>:result = "ok"|"error"` в чекпойнт и вызывая `runPlan` заново с тем же `goal` —
  вплоть до ещё одного `tool_call`, если план требует второй вызов подряд.
- **Виджет** (`packages/pleiades-widget`): `lib/webmcp.ts`'s `WebMcpProvider` — узкая абстракция
  над `navigator.modelContext`/`document.modelContext` (best-effort, API нестабилен — см. ниже),
  не сама реализация напрямую, чтобы `chat.ts` и его тесты не зависели от несуществующего в
  `bun test` браузерного API. `chat.ts`'s `readReply` стал циклом: на `tool_call` — вызывает
  `webmcp.callTool(...)`, затем продолжает через `api.sendToolResult(...)` на новом стриме. Без
  провайдера вообще (сегодня — любой реальный браузер) `syncWebMcpTools` не делает ни одного
  сетевого вызова — нечего регистрировать и нечего чистить.

**Каталог тулов регистрируется один раз при открытии панели, не на каждое сообщение (найдено и
исправлено 2026-09-29).** Первая версия отправляла `webmcpTools` вместе с *каждым*
`/v1/widget/messages`/`/v1/widget/tool-results` — с реальным каталогом (у демки
`apps/shopping-cart-webmcp` — 15 тулов с настоящими описаниями/схемами, тела`definitions.js` уже
13+ кБ) это (а) валило `413` на самом первом сообщении, `WIDGET_MAX_TEXT_CHARS` рассчитан на
короткий текст чата, не на каталог тулов, и (б) заново гоняло классификацию через Laya на каждое
сообщение — раньше не пойманная лишняя нагрузка ровно из-за (а). Исправлено: `chat.ts`'s
`syncWebMcpTools()` вызывает `api.registerWebMcpTools(...)` → `POST /v1/widget/tools` один раз в
конце `open()` (панель открылась) и повторно из `setToolMode()` (режим переключили, пока панель
уже открыта) — не из `send()`. Сервер (`server.ts`'s `registerWebMcpTools`, `webmcpCatalog: Map<threadId,
GoapAction[]>` в `ServerDeps`, в памяти процесса — теряется при рестарте, виджет просто
регистрирует заново при следующем открытии) классифицирует и кэширует по `threadId`;
`resolveDynamicActions` берёт готовый список из кэша вместо параметра запроса.
`/v1/widget/messages`/`/v1/widget/tool-results` каталог больше не принимают вовсе. Отдельный лимит
`WIDGET_MAX_WEBMCP_TOOLS_CHARS` (20000 по умолчанию, много больше `WIDGET_MAX_TEXT_CHARS`) —
регистрация разовая, может позволить себе быть крупнее.

**Первая версия `createNavigatorWebMcpProvider` не работала вообще (найдено и исправлено
2026-09-29).** Реальная поверхность API — `document.modelContext.getTools()` (async, перечитывается
на каждый вызов — тулы приходят и уходят вместе с состоянием страницы) и
**`executeTool(tool, argsJson)`**, которая принимает **сам объект тула** (не просто имя) и
**JSON-строку** аргументов, отвечает JSON-строкой либо уже распарсенным MCP-объектом. Никакого
`callTool(name, args)` не существует — первая версия файла угадала именно такую сигнатуру и
проверяла именно её наличие для фиче-детекта, поэтому `createNavigatorWebMcpProvider` **всегда**
возвращала `undefined`, даже при полностью рабочем `document.modelContext` — WebMCP молча не
работал целиком. Подтверждено эмпирически по рабочему вызывающему коду в
`apps/shopping-cart-webmcp/skills/grocery-staples/scripts/webmcp-bridge.js` (реальный клиент,
вызывающий `context.getTools()`/`context.executeTool(tool, JSON.stringify(args))`) и по README
`use-webmcp-tool` (сторона регистрации, `document.modelContext.registerTool` — другое направление,
не то, что нужно вызывающему). `document.modelContext` при этом — не нативный API браузера:
"typically injected by a browser extension" (та же README); голый Chromium/Chrome без такого
расширения его не создаёт вообще — это подтверждено и для Playwright-бандла Chromium, и для
системного `google-chrome-stable` (см. ниже).

**E2E-регрессия — `apps/e2e`** (Playwright, `bunx playwright test`, отдельный `bun run test:e2e`
в корне — не часть обычного `bun run test`, нужен `bunx playwright install chromium` один раз,
как `test:beta-text`). `bun:test` не имеет DOM, поэтому не мог поймать этот баг — весь
`WebMcpProvider`-раунд-трип там тестируется через фейки, которые сами угадывали правильную форму
(см. `webmcp.test.ts`, добавлен вместе с исправлением). `apps/e2e/tests/webmcp.spec.ts` вместо
этого гоняет настоящий виджет (`packages/pleiades-widget/dist/pleiades-widget.js`, собранный
бандл) в настоящем браузере (`channel: "chrome"`, системный, не отдельная загрузка Chromium),
подсовывая через `page.addInitScript()` `document.modelContext` с точной реальной формой
(`getTools`/`executeTool`) — то есть эмулирует расширение, а не сам факт WebMCP. Проверено вручную
(отключение фикса → все три теста падают именно там, где ловится баг; включение фикса → все три
проходят) — тест реально ловит именно эту регрессию, не просто зелёный по недосмотру.

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

## Приоритет: не каждое сообщение — задача

Пользователь не обязан сразу писать "подбери ингредиенты для яишницы" — первым сообщением
вполне может быть "привет". Раз GOAP видит только `goal` (плоский набор фактов), а не текст,
кто-то должен решить *до* вызова `runPlan`, какой именно `goal` в этот раз нужен: обычный
`{ replied: true }` или тот же плюс факт, который реально требует WebMCP/MCP-тула.

Это ещё одна классификация Laya — но не та, что из предыдущего раздела (там классифицируется
**тул**, один раз при построении каталога), а над **сообщением**, на каждый ход:
`classifyMessageIntent` (`packages/core/src/goap/message-intent.ts`) задаёт один `choice`-вопрос
с вариантами `"chat"` + весь `TOOL_INTENTS` (`packages/core/src/goap/intent-taxonomy.ts`, общий
с классификатором тулов) и по умолчанию возвращает `"chat"`, если Laya ответила чем-то вне
списка. Результат превращается в `goal` через `goalForIntent`: `"chat"` — оставляет базовую
цель как есть, любой другой intent — добавляет `EFFECTS_BY_INTENT[intent]` (например
`{ inCart: true }` для `"addToCart"`), но **только если хотя бы одно действие в текущем
каталоге в принципе способно произвести этот факт** — иначе `plan()` получил бы недостижимую
цель и упал бы с `"no plan reached the goal"` на ровном месте, хотя виноват не пользователь, а
то, что WebMCP-тулы для этого треда ещё не подключены.

Реализовано в `apps/alpha-orchestrator/src/modules/run-stream/run-stream.ts`'s `streamPlanRun`: классификация
запускается только когда `threadActionsFor` вообще что-то вернул для этого треда (обычный
случай сегодня — ничего, раз WebMCP ещё не подключён, см. раздел выше) — значит, для подавляющего
большинства сообщений ("привет" включая) лишний вызов Laya не тратится вообще, `generateReply`
(cost 5) остаётся единственным действием в каталоге и побеждает тривиально. Обычный текстовый
ответ (`albedo`/`beta-text`) в этой схеме и есть тот самый "дефолтный, дешёвый путь", который
выигрывает, если классификация не даёт причин усложнять `goal`.

Почему не как `GoapAction` внутри графа: `plan()` сопоставляет действие с целью по его
**статичным** `effects` (см. `plan.ts`) — одно и то же действие не может для одного вызова
пообещать `{ messageIntent: "chat" }`, а для другого `{ messageIntent: "addToCart" }`. Значит,
разветвление по результату классификации в принципе не выразимо как узел backward-chaining
графа — тот же аргумент, что и в разделе "Отвергнутый вариант" выше, только на уровень выше:
не отдельный шаг внутри похода по магазину, а выбор всего похода на старте хода.

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
