import { DEFAULT_LOCALE, type Locale } from "#lib/i18n.js";

// All landing (/landing/pleiades-orchestra) copy, per locale. Sources/links stay in the components'
// data; only text lives here. Every other locale must have the same shape as `en` (the `Record<Locale, ...>` below makes a missing language a type error).
const en = {
	nav: {
		history: "history",
		about: "about",
		mcp: "mcp",
		platforms: "platforms",
		benefits: "benefits",
		security: "security",
		pricing: "pricing",
	},
	common: { source: "source" },
	seo: {
		title: "PleiadesOrchestra",
		description:
			"Open-source GOAP orchestrator for tiny models: a website chatbot that works through MCP and WebMCP tools. Free under AGPLv3, commercial license for closed-source use.",
	},
	video: {
		aria: "PleiadesOrchestra demo",
		videoAria: "PleiadesOrchestra: prompt, decision, action",
		lead: "Open-source orchestrator with GOAP for tiny models. A chatbot for your website that works through your site’s own MCP / WebMCP tools — no GPU, no big model.",
		early: "Early stage · in active development",
		get: "get it",
		github: "source on GitHub",
		playground: "playground",
		docs: "docs",
		pause: "pause",
		play: "play",
	},
	history: {
		heading: "Agents don’t just search anymore. They act.",
		lead: "Through MCP, an AI agent can use a product the way a person does: put an item in the cart, buy it, create a deal, log a call. This is how the big platforms got there.",
		canLabel: "What the agent can do",
		events: [
			{
				date: "2025-06-23",
				title: "Salesforce Agentforce 3: native MCP client",
				text: "Agents connect to any MCP-compliant server without custom code. A CRM stops being only a database and becomes something an agent works inside.",
				can: ["call external tools"],
			},
			{
				date: "2025-09",
				title: "ChatGPT Instant Checkout, then back to the merchant’s own app",
				text: "OpenAI and Stripe open-source the Agentic Commerce Protocol so an agent can buy inside the chat — US only, starting with Etsy. By March 2026 OpenAI moves checkout to retailers’ own apps: few merchants joined and the buy button converted under 1%.",
				can: ["buy (US, 2025–26)"],
			},
			{
				date: "2025-12",
				title: "MCP moves to the Linux Foundation",
				text: "Anthropic donates the protocol to the Agentic AI Foundation, co-founded with Block and OpenAI and backed by Google, Microsoft, AWS and Cloudflare. Supported by ChatGPT, Gemini, Copilot, Cursor and VS Code.",
				can: ["one standard for every agent"],
			},
			{
				date: "Shopify",
				title: "Every store gets its own MCP endpoint",
				text: "The Storefront MCP server lets an agent search the catalog, read product details and store policies, build and edit a cart, and hand the shopper a checkout link. Shopify now steers new integrations to its Universal Commerce Protocol endpoint.",
				can: [
					"search",
					"add to cart",
					"edit cart",
					"checkout link",
					"answer policy questions",
				],
			},
			{
				date: "2026-04-13",
				title: "HubSpot remote MCP server is generally available",
				text: "Read and write access over OAuth 2.1: contacts, companies, deals, tickets, plus calls, meetings, notes and tasks. Every action respects the user’s own permissions.",
				can: ["create contacts", "update deals", "log calls", "create tasks"],
			},
			{
				date: "2026-04-29",
				title: "Salesforce hosted MCP servers are generally available",
				text: "A Salesforce-managed endpoint exposes an org’s data, flows, Apex actions and queries to any MCP-compatible client, Enterprise Edition and above.",
				can: ["query data", "run flows", "run Apex actions"],
			},
		],
		cis: {
			heading: "CIS: who has an assistant, who acts",
			legend: "✓ found · – not found",
			yes: "yes",
			no: "no",
			cols: {
				country: "Country",
				assistant: "Buyer assistant",
				acts: "Acts: cart, checkout",
				mcp: "MCP",
				note: "Note",
			},
			rows: [
				{
					country: "Russia",
					assistant: true,
					acts: true,
					mcp: false,
					note: "Ozon and Wildberries only advise. Only Yandex acts, through its own closed protocol.",
				},
				{
					country: "Kazakhstan",
					assistant: true,
					acts: false,
					mcp: false,
					note: "Kaspi’s Kasper (pilot) recommends, does not buy. Nothing at Halyk or Freedom.",
				},
				{
					country: "Uzbekistan",
					assistant: false,
					acts: false,
					mcp: false,
					note: "None at Uzum. Wildberries’ assistant, availability unclear.",
				},
				{
					country: "Belarus",
					assistant: true,
					acts: false,
					mcp: false,
					note: "Only Wildberries’ assistant, limited rollout.",
				},
				{
					country: "Kyrgyzstan",
					assistant: false,
					acts: false,
					mcp: false,
					note: "Bank voice assistants only.",
				},
				{
					country: "Azerbaijan",
					assistant: false,
					acts: false,
					mcp: false,
					note: "A wallet chat for payments, no shop assistant.",
				},
				{
					country: "Armenia",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
				{
					country: "Georgia",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
				{
					country: "Tajikistan",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
				{
					country: "Turkmenistan",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
			],
		},
	},
	about: {
		heading: "About Pleiades",
		text: "PleiadesOrchestra is a self-hosted orchestrator for tiny models. Instead of one huge prompt it builds a chain of actions towards a goal (GOAP), so a 1B-parameter model can find a product, add it to the cart or compare items on a real site. It works with facts and prepared answers — it does not pretend to be a professional consultant.",
		stars: [
			{
				name: "alpha-orchestrator",
				role: "GOAP planner, users, access, history, token usage",
			},
			{
				name: "beta-text",
				role: "Small text model (llama-server, Vulkan or CPU)",
			},
			{ name: "gamma-decision", role: "Fast typed decisions on Laya" },
			{
				name: "delta-function-call",
				role: "Fills in the JSON arguments of tool calls",
			},
		],
		stats: [
			{ label: "idle RAM, whole stack", value: "~2 GiB" },
			{ label: "GPU", value: "optional" },
			{ label: "deploy", value: "docker compose up" },
		],
	},
	mcp: {
		heading: "MCP server vs WebMCP",
		lead: "Two different transports, not one catalog reachable two ways. Pleiades supports both.",
		noteStrong: "WebMCP is experimental.",
		noteBefore:
			" It is a W3C Community Group draft, shipped in Chrome as an early preview and not yet a stable cross-browser feature. The API surface is still changing: the draft moves from",
		noteTo: "to",
		noteAfter:
			"Chrome Status lists Chrome 157, due 3 November 2026, as the anticipated release — a target, not a committed date.",
		releaseTarget: "release target",
		colMcp: "MCP server",
		colWeb: "WebMCP",
		experimental: "(experimental)",
		rows: [
			{
				label: "where the tools live",
				mcp: "On an MCP server the orchestrator can reach (stdio / SSE).",
				web: "In the visitor’s browser, on the page that embeds the widget (navigator.modelContext).",
			},
			{
				label: "who runs the call",
				mcp: "The server calls the tool itself.",
				web: "The widget calls it in the browser; the server pauses the plan and resumes it with the result.",
			},
			{
				label: "what the site needs",
				mcp: "A real MCP server next to the shop or service.",
				web: "Only the tools it already exposes on its pages — no backend integration.",
			},
			{
				label: "sees the visitor’s state",
				mcp: "Only what the server knows.",
				web: "Yes: the open page, the cart, the chosen city — as the visitor sees it.",
			},
			{
				label: "maturity",
				mcp: "Established protocol.",
				web: "Experimental browser API; behind a flag in Chrome today.",
			},
		],
	},
	platforms: {
		heading: "Where small CIS shops actually live",
		lead: "Most small shops run on WooCommerce, OpenCart or 1C-Bitrix, not on Shopify. None of them gives a ready shopping agent out of the box. Pleiades is a widget on the page, so it does not wait for the CMS to become agent-ready.",
		items: [
			{
				name: "WordPress + WooCommerce",
				text: "WordPress has an official MCP Adapter, and WooCommerce ships an MCP integration since 10.3. Both are still early: WooCommerce calls it a developer preview.",
				status: "official, early",
			},
			{
				name: "1C-Bitrix",
				text: "The most used store engine in Russia (about 29% of shops, though over half run a custom CMS). Bitrix24 has official MCP servers; for the store engine we found only third-party developer tools.",
				status: "CRM official, store: none",
			},
			{
				name: "OpenCart",
				text: "A separate store CMS, not a WordPress plugin. No official MCP; third-party extensions exist, such as EcomAiBridge in the OpenCart marketplace.",
				status: "third-party only",
			},
		],
	},
	benefits: {
		heading: "Benefits",
		items: [
			{
				title: "Tiny models",
				text: "Built for small businesses without a GPU or a budget for expensive models.",
			},
			{
				title: "A plan, not a prompt",
				text: "GOAP builds a chain of actions towards the goal, so a small model stays on track.",
			},
			{
				title: "Uses your site’s tools",
				text: "Find a product, add to cart, compare — through the MCP / WebMCP tools you already have.",
			},
			{
				title: "Self-hosted",
				text: "The whole stack runs on one Linux machine with Docker Compose. Your data stays yours.",
			},
			{
				title: "Light widget",
				text: "One web component, under 40 kB brotli, works in React, Vue, Svelte or plain HTML.",
			},
			{
				title: "See every decision",
				text: "The admin panel draws each request as a graph: prompt, steps, tool answers, result.",
			},
		],
	},
	security: {
		heading: "Security and who gets paid",
		lead: "Whoever owns the agent owns the recommendation, the ad and the customer. That is the real question behind every protocol on this page.",
		points: [
			{
				title: "Yandex is the one to watch",
				text: "Its Commerce Protocol is closed and proprietary, not MCP. A closed platform that ranks the recommendations in the dialogue and sells the ads around them has every reason to favour its own results. The shop becomes a supplier; the customer relationship and the ad budget go to the platform.",
			},
			{
				title: "Google’s open protocols are not charity",
				text: "WebMCP and the Universal Commerce Protocol are open — and they feed Google’s own search, ads and Merchant Center. The more sites expose tools in the open, the more of the traffic is automated: corporate agents and bots of every kind that the shop does not control.",
			},
			{
				title: "Open means exposed",
				text: "Browser vendors are not aligned: Mozilla has filed concerns about agents acting without the user seeing it, and WebKit opposes sites telling agents from people. Limits, permissions and an audit trail belong on the shop’s side.",
			},
			{
				title: "The shop keeps its own customer",
				text: "Pleiades is self-hosted. Recommendations, customer data and the ad slot stay on the shop’s own site instead of moving into someone else’s results. The plan behind every answer is a readable graph, and the tools are the ones the site itself exposes.",
			},
		],
		early: {
			heading: "Early stage, in active development",
			text: "Pleiades is at an early stage and under active development: the first commit is from August 2026. Features and APIs change, and we do not promise security guarantees we have not shown. Free under AGPLv3; a one-time commercial license is for closed-source use.",
		},
	},
	pricing: {
		heading: "Community or business",
		community: {
			title: "Community",
			price: "free",
			text: "Open code under the GNU AGPLv3. Run it for yourself, change it, contribute. If you let people use a modified version over a network, you publish your changes.",
			cta: "get the source",
		},
		business: {
			title: "Business",
			oneTime: "one time",
			text: "Private code: build it into a closed-source product or run a modified version without publishing it. Perpetual license, covers all versions. No support included.",
			buy: "buy license",
			ask: "ask for a license",
			terms: "license terms",
		},
	},
};

export type LandingContent = typeof en;

const ru: LandingContent = {
	nav: {
		history: "история",
		about: "о проекте",
		mcp: "mcp",
		platforms: "платформы",
		benefits: "плюсы",
		security: "безопасность",
		pricing: "цена",
	},
	common: { source: "источник" },
	seo: {
		title: "PleiadesOrchestra",
		description:
			"Open-source GOAP-оркестратор для маленьких моделей: чат-бот для сайта, который работает через инструменты MCP и WebMCP. Бесплатно по AGPLv3, коммерческая лицензия для закрытого кода.",
	},
	video: {
		aria: "Демо PleiadesOrchestra",
		videoAria: "PleiadesOrchestra: запрос, решение, действие",
		lead: "Open-source оркестратор с GOAP для маленьких моделей. Чат-бот для вашего сайта, который работает через собственные MCP / WebMCP-инструменты сайта — без GPU и без большой модели.",
		early: "Ранняя стадия · активная разработка",
		get: "получить",
		github: "исходники на GitHub",
		playground: "песочница",
		docs: "документация",
		pause: "пауза",
		play: "играть",
	},
	history: {
		heading: "Агенты больше не только ищут. Они действуют.",
		lead: "Через MCP ИИ-агент может пользоваться продуктом, как человек: положить товар в корзину, купить, создать сделку, записать звонок. Вот как к этому пришли крупные платформы.",
		canLabel: "Что может агент",
		events: [
			{
				date: "2025-06-23",
				title: "Salesforce Agentforce 3: встроенный MCP-клиент",
				text: "Агенты подключаются к любому MCP-серверу без своего кода. CRM перестаёт быть просто базой данных и становится средой, в которой работает агент.",
				can: ["вызывать внешние инструменты"],
			},
			{
				date: "2025-09",
				title:
					"ChatGPT Instant Checkout, а затем возврат к приложению продавца",
				text: "OpenAI и Stripe открывают Agentic Commerce Protocol, чтобы агент мог купить прямо в чате — только в США, начиная с Etsy. К марту 2026 OpenAI переносит оформление в приложения ритейлеров: продавцов подключилось мало, а кнопка покупки конвертировала меньше 1%.",
				can: ["купить (США, 2025–26)"],
			},
			{
				date: "2025-12",
				title: "MCP переходит под Linux Foundation",
				text: "Anthropic передаёт протокол фонду Agentic AI Foundation, который основали вместе с Block и OpenAI при поддержке Google, Microsoft, AWS и Cloudflare. Его поддерживают ChatGPT, Gemini, Copilot, Cursor и VS Code.",
				can: ["единый стандарт для всех агентов"],
			},
			{
				date: "Shopify",
				title: "У каждого магазина свой MCP-эндпоинт",
				text: "Storefront MCP-сервер позволяет агенту искать по каталогу, читать карточки товаров и правила магазина, собирать и менять корзину и отдавать покупателю ссылку на оплату. Новые интеграции Shopify теперь направляет на эндпоинт Universal Commerce Protocol.",
				can: [
					"поиск",
					"добавить в корзину",
					"изменить корзину",
					"ссылка на оплату",
					"ответы по правилам магазина",
				],
			},
			{
				date: "2026-04-13",
				title: "Удалённый MCP-сервер HubSpot вышел в GA",
				text: "Чтение и запись по OAuth 2.1: контакты, компании, сделки, тикеты, а также звонки, встречи, заметки и задачи. Каждое действие соблюдает права самого пользователя.",
				can: [
					"создать контакт",
					"обновить сделку",
					"записать звонок",
					"создать задачу",
				],
			},
			{
				date: "2026-04-29",
				title: "Hosted MCP-серверы Salesforce вышли в GA",
				text: "Управляемый Salesforce эндпоинт открывает данные организации, flows, Apex-действия и запросы любому MCP-совместимому клиенту, начиная с Enterprise Edition.",
				can: ["запросить данные", "запустить flow", "вызвать Apex-действие"],
			},
		],
		cis: {
			heading: "СНГ: у кого есть ассистент, кто действует",
			legend: "✓ найдено · – не найдено",
			yes: "да",
			no: "нет",
			cols: {
				country: "Страна",
				assistant: "Ассистент покупателя",
				acts: "Действует: корзина, оплата",
				mcp: "MCP",
				note: "Примечание",
			},
			rows: [
				{
					country: "Россия",
					assistant: true,
					acts: true,
					mcp: false,
					note: "Ozon и Wildberries только советуют. Действует лишь Яндекс, по собственному закрытому протоколу.",
				},
				{
					country: "Казахстан",
					assistant: true,
					acts: false,
					mcp: false,
					note: "Kasper от Kaspi (пилот) рекомендует, но не покупает. У Halyk и Freedom ничего.",
				},
				{
					country: "Узбекистан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "У Uzum нет. Ассистент Wildberries, доступность неясна.",
				},
				{
					country: "Беларусь",
					assistant: true,
					acts: false,
					mcp: false,
					note: "Только ассистент Wildberries, ограниченный запуск.",
				},
				{
					country: "Кыргызстан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "Только голосовые ассистенты банков.",
				},
				{
					country: "Азербайджан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "Чат в кошельке для платежей, ассистента для покупок нет.",
				},
				{
					country: "Армения",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
				{
					country: "Грузия",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
				{
					country: "Таджикистан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
				{
					country: "Туркменистан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
			],
		},
	},
	about: {
		heading: "О Pleiades",
		text: "PleiadesOrchestra — это self-hosted оркестратор для маленьких моделей. Вместо одного огромного промпта он строит цепочку действий к цели (GOAP), поэтому модель на 1 млрд параметров может найти товар, добавить его в корзину или сравнить позиции на реальном сайте. Он работает с фактами и заготовленными ответами и не притворяется профессиональным консультантом.",
		stars: [
			{
				name: "alpha-orchestrator",
				role: "GOAP-планировщик, пользователи, доступы, история, расход токенов",
			},
			{
				name: "beta-text",
				role: "Небольшая текстовая модель (llama-server, Vulkan или CPU)",
			},
			{
				name: "gamma-decision",
				role: "Быстрые типизированные решения на Laya",
			},
			{
				name: "delta-function-call",
				role: "Заполняет JSON-аргументы вызовов инструментов",
			},
		],
		stats: [
			{ label: "RAM в простое, весь стек", value: "~2 GiB" },
			{ label: "GPU", value: "по желанию" },
			{ label: "запуск", value: "docker compose up" },
		],
	},
	mcp: {
		heading: "MCP-сервер и WebMCP",
		lead: "Два разных транспорта, а не один каталог, доступный двумя способами. Pleiades поддерживает оба.",
		noteStrong: "WebMCP экспериментален.",
		noteBefore:
			" Это черновик W3C Community Group, в Chrome он вышел как ранний preview и пока не стабильная кросс-браузерная функция. Интерфейс API ещё меняется: в черновике",
		noteTo: "заменяется на",
		noteAfter:
			"По данным Chrome Status, ожидаемый релиз — Chrome 157, 3 ноября 2026: это цель, а не твёрдая дата.",
		releaseTarget: "срок релиза",
		colMcp: "MCP-сервер",
		colWeb: "WebMCP",
		experimental: "(экспериментально)",
		rows: [
			{
				label: "где живут инструменты",
				mcp: "На MCP-сервере, до которого может достать оркестратор (stdio / SSE).",
				web: "В браузере посетителя, на странице, где встроен виджет (navigator.modelContext).",
			},
			{
				label: "кто выполняет вызов",
				mcp: "Сервер сам вызывает инструмент.",
				web: "Виджет вызывает его в браузере; сервер приостанавливает план и продолжает его с результатом.",
			},
			{
				label: "что нужно сайту",
				mcp: "Настоящий MCP-сервер рядом с магазином или сервисом.",
				web: "Только инструменты, которые он уже выставляет на своих страницах, — без интеграции на бэкенде.",
			},
			{
				label: "видит состояние посетителя",
				mcp: "Только то, что знает сервер.",
				web: "Да: открытую страницу, корзину, выбранный город — как их видит посетитель.",
			},
			{
				label: "зрелость",
				mcp: "Устоявшийся протокол.",
				web: "Экспериментальный API браузера; сегодня в Chrome за флагом.",
			},
		],
	},
	platforms: {
		heading: "Где на самом деле живут небольшие магазины СНГ",
		lead: "Большинство небольших магазинов работает на WooCommerce, OpenCart или 1С-Битрикс, а не на Shopify. Ни одна из этих платформ не даёт готового агента для покупок из коробки. Pleiades — это виджет на странице, поэтому он не ждёт, пока CMS станет «агентной».",
		items: [
			{
				name: "WordPress + WooCommerce",
				text: "У WordPress есть официальный MCP Adapter, а WooCommerce поставляет MCP-интеграцию с версии 10.3. Обе пока ранние: WooCommerce называет её developer preview.",
				status: "официально, рано",
			},
			{
				name: "1С-Битрикс",
				text: "Самый распространённый движок магазинов в России (около 29% магазинов, хотя больше половины работают на самописной CMS). У Битрикс24 есть официальные MCP-серверы; для самого движка магазина мы нашли только сторонние инструменты для разработчиков.",
				status: "CRM официально, магазин: нет",
			},
			{
				name: "OpenCart",
				text: "Отдельная CMS для магазинов, а не плагин WordPress. Официального MCP нет; есть сторонние расширения, например EcomAiBridge в маркетплейсе OpenCart.",
				status: "только сторонние",
			},
		],
	},
	benefits: {
		heading: "Преимущества",
		items: [
			{
				title: "Маленькие модели",
				text: "Для малого бизнеса без GPU и без бюджета на дорогие модели.",
			},
			{
				title: "План, а не промпт",
				text: "GOAP строит цепочку действий к цели, поэтому маленькая модель не сбивается с пути.",
			},
			{
				title: "Использует инструменты вашего сайта",
				text: "Найти товар, добавить в корзину, сравнить — через MCP / WebMCP-инструменты, которые у вас уже есть.",
			},
			{
				title: "Self-hosted",
				text: "Весь стек работает на одной Linux-машине через Docker Compose. Ваши данные остаются вашими.",
			},
			{
				title: "Лёгкий виджет",
				text: "Один веб-компонент, меньше 40 КБ в brotli, работает в React, Vue, Svelte и на чистом HTML.",
			},
			{
				title: "Видно каждое решение",
				text: "Админ-панель рисует каждый запрос графом: промпт, шаги, ответы инструментов, результат.",
			},
		],
	},
	security: {
		heading: "Безопасность и кому платят",
		lead: "Тот, кто владеет агентом, владеет рекомендацией, рекламой и клиентом. Это и есть настоящий вопрос за каждым протоколом на этой странице.",
		points: [
			{
				title: "За Яндексом нужно следить",
				text: "Его Commerce Protocol закрытый и собственный, это не MCP. Закрытая платформа, которая сама ранжирует рекомендации в диалоге и продаёт рекламу вокруг них, заинтересована продвигать собственную выдачу. Магазин становится поставщиком, а отношения с клиентом и рекламный бюджет уходят платформе.",
			},
			{
				title: "Открытые протоколы Google — не благотворительность",
				text: "WebMCP и Universal Commerce Protocol открыты — и работают на собственный поиск, рекламу и Merchant Center Google. Чем больше сайтов открыто выставляют инструменты, тем больше трафика становится автоматическим: корпоративные агенты и боты всех видов, которых магазин не контролирует.",
			},
			{
				title: "Открытость — это и уязвимость",
				text: "Разработчики браузеров не согласны между собой: Mozilla заявила возражения против действий агентов без ведома пользователя, а WebKit против того, чтобы сайты отличали агентов от людей. Лимиты, права и журнал действий должны быть на стороне магазина.",
			},
			{
				title: "Магазин сохраняет своего клиента",
				text: "Pleiades работает на вашем сервере. Рекомендации, данные клиентов и рекламное место остаются на собственном сайте магазина, а не уходят в чужую выдачу. План за каждым ответом — читаемый граф, а инструменты — те, что выставляет сам сайт.",
			},
		],
		early: {
			heading: "Ранняя стадия, идёт активная разработка",
			text: "Pleiades на ранней стадии и активно разрабатывается: первый коммит — август 2026 года. Возможности и API меняются, и мы не обещаем гарантий безопасности, которых не показали. Бесплатно по AGPLv3; разовая коммерческая лицензия — для закрытого кода.",
		},
	},
	pricing: {
		heading: "Сообщество или бизнес",
		community: {
			title: "Сообщество",
			price: "бесплатно",
			text: "Открытый код под GNU AGPLv3. Запускайте для себя, меняйте, вносите вклад. Если вы даёте людям пользоваться изменённой версией по сети, вы публикуете свои изменения.",
			cta: "получить исходники",
		},
		business: {
			title: "Бизнес",
			oneTime: "разово",
			text: "Закрытый код: встроить в проприетарный продукт или запускать изменённую версию без публикации. Бессрочная лицензия, действует на все версии. Поддержка не входит.",
			buy: "купить лицензию",
			ask: "запросить лицензию",
			terms: "условия лицензии",
		},
	},
};

const kk: LandingContent = {
	nav: {
		history: "тарих",
		about: "жоба туралы",
		mcp: "mcp",
		platforms: "платформалар",
		benefits: "артықшылықтар",
		security: "қауіпсіздік",
		pricing: "бағасы",
	},
	common: { source: "дереккөз" },
	seo: {
		title: "PleiadesOrchestra",
		description:
			"Шағын модельдерге арналған open-source GOAP оркестраторы: MCP және WebMCP құралдары арқылы жұмыс істейтін веб-сайт чат-боты. AGPLv3 бойынша тегін, жабық код үшін коммерциялық лицензия бар.",
	},
	video: {
		aria: "PleiadesOrchestra демосы",
		videoAria: "PleiadesOrchestra: сұраныс, шешім, әрекет",
		lead: "Шағын модельдерге арналған GOAP бар open-source оркестратор. Сіздің сайтыңыздың өз MCP / WebMCP құралдары арқылы жұмыс істейтін чат-бот — GPU мен үлкен модельсіз.",
		early: "Ерте кезең · белсенді әзірлеу",
		get: "алу",
		github: "GitHub-тағы бастапқы код",
		playground: "ойын алаңы",
		docs: "құжаттама",
		pause: "кідірту",
		play: "ойнату",
	},
	history: {
		heading: "Агенттер енді тек іздемейді. Олар әрекет етеді.",
		lead: "MCP арқылы ЖИ-агент өнімді адам сияқты пайдалана алады: тауарды себетке салу, сатып алу, мәміле құру, қоңырауды тіркеу. Ірі платформалар бұған осылай келді.",
		canLabel: "Агент не істей алады",
		events: [
			{
				date: "2025-06-23",
				title: "Salesforce Agentforce 3: нативті MCP клиенті",
				text: "Агенттер кез келген MCP-үйлесімді серверге арнайы кодсыз қосылады. CRM тек дерекқор болудан қалып, агент ішінде жұмыс істейтін ортаға айналады.",
				can: ["сыртқы құралдарды шақыру"],
			},
			{
				date: "2025-09",
				title: "ChatGPT Instant Checkout, сосын сатушының өз қосымшасына оралу",
				text: "OpenAI мен Stripe агент чаттың ішінде сатып алуы үшін Agentic Commerce Protocol протоколын ашық кодпен жариялады — тек АҚШ-та, Etsy-ден бастап. 2026 жылғы наурызға қарай OpenAI төлемді сатушылардың өз қосымшаларына көшіреді: қосылған сатушылар аз болды, ал сатып алу түймесінің конверсиясы 1%-дан төмен болды.",
				can: ["сатып алу (АҚШ, 2025–26)"],
			},
			{
				date: "2025-12",
				title: "MCP Linux Foundation-ға өтеді",
				text: "Anthropic протоколды Block және OpenAI бірлесіп құрған, Google, Microsoft, AWS және Cloudflare қолдайтын Agentic AI Foundation-ға тапсырады. ChatGPT, Gemini, Copilot, Cursor және VS Code қолдайды.",
				can: ["барлық агенттерге арналған бір стандарт"],
			},
			{
				date: "Shopify",
				title: "Әр дүкен өз MCP эндпоинтін алады",
				text: "Storefront MCP сервері агентке каталогтан іздеуге, тауар мәліметтері мен дүкен ережелерін оқуға, себетті құру және өзгертуге, сатып алушыға төлем сілтемесін беруге мүмкіндік береді. Қазір Shopify жаңа интеграцияларды өзінің Universal Commerce Protocol эндпоинтіне бағыттайды.",
				can: [
					"іздеу",
					"себетке салу",
					"себетті өзгерту",
					"төлем сілтемесі",
					"ереже сұрақтарына жауап беру",
				],
			},
			{
				date: "2026-04-13",
				title: "HubSpot remote MCP сервері жалпыға қолжетімді",
				text: "OAuth 2.1 арқылы оқу және жазу рұқсаты: контактілер, компаниялар, мәмілелер, тикеттер, сонымен қатар қоңыраулар, кездесулер, жазбалар және тапсырмалар. Әр әрекет пайдаланушының өз рұқсаттарын сақтайды.",
				can: [
					"контактілер құру",
					"мәмілелерді жаңарту",
					"қоңырауларды тіркеу",
					"тапсырмалар құру",
				],
			},
			{
				date: "2026-04-29",
				title: "Salesforce hosted MCP серверлері жалпыға қолжетімді",
				text: "Salesforce басқаратын эндпоинт ұйымның деректерін, flow-ларын, Apex әрекеттерін және сұраныстарын кез келген MCP-үйлесімді клиентке ұсынады, Enterprise Edition және одан жоғары.",
				can: [
					"деректерге сұраныс",
					"flow іске қосу",
					"Apex әрекеттерін іске қосу",
				],
			},
		],
		cis: {
			heading: "ТМД: кімде көмекші бар, кім әрекет етеді",
			legend: "✓ табылды · – табылмады",
			yes: "иә",
			no: "жоқ",
			cols: {
				country: "Ел",
				assistant: "Сатып алушы көмекшісі",
				acts: "Әрекет етеді: себет, төлем",
				mcp: "MCP",
				note: "Ескерту",
			},
			rows: [
				{
					country: "Ресей",
					assistant: true,
					acts: true,
					mcp: false,
					note: "Ozon мен Wildberries тек кеңес береді. Тек Yandex әрекет етеді, өзінің жабық протоколы арқылы.",
				},
				{
					country: "Қазақстан",
					assistant: true,
					acts: false,
					mcp: false,
					note: "Kaspi-дің Kasper (пилот) ұсыныс береді, сатып алмайды. Halyk пен Freedom-да ештеңе жоқ.",
				},
				{
					country: "Өзбекстан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "Uzum-да жоқ. Wildberries көмекшісі, қолжетімділігі белгісіз.",
				},
				{
					country: "Беларусь",
					assistant: true,
					acts: false,
					mcp: false,
					note: "Тек Wildberries көмекшісі, шектеулі іске қосу.",
				},
				{
					country: "Қырғызстан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "Тек банктердің дауыстық көмекшілері.",
				},
				{
					country: "Әзірбайжан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "Төлемдерге арналған әмиян чаты, дүкен көмекшісі жоқ.",
				},
				{
					country: "Армения",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
				{
					country: "Грузия",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
				{
					country: "Тәжікстан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
				{
					country: "Түрікменстан",
					assistant: false,
					acts: false,
					mcp: false,
					note: "",
				},
			],
		},
	},
	about: {
		heading: "Pleiades туралы",
		text: "PleiadesOrchestra — шағын модельдерге арналған self-hosted оркестратор. Бір үлкен промптың орнына ол мақсатқа жететін әрекеттер тізбегін құрады (GOAP), сондықтан 1 млрд параметрлі модель нақты сайтта тауар тауып, себетке сала алады немесе тауарларды салыстыра алады. Ол фактілермен және дайын жауаптармен жұмыс істейді — кәсіби кеңесшіні бейнелемейді.",
		stars: [
			{
				name: "alpha-orchestrator",
				role: "GOAP жоспарлаушысы, пайдаланушылар, қолжетімділік, тарих, токен шығыны",
			},
			{
				name: "beta-text",
				role: "Шағын мәтіндік модель (llama-server, Vulkan немесе CPU)",
			},
			{ name: "gamma-decision", role: "Laya-дағы жылдам типтелген шешімдер" },
			{
				name: "delta-function-call",
				role: "Құрал шақыруларының JSON аргументтерін толтырады",
			},
		],
		stats: [
			{ label: "бос RAM, бүкіл стек", value: "~2 GiB" },
			{ label: "GPU", value: "міндетті емес" },
			{ label: "орнату", value: "docker compose up" },
		],
	},
	mcp: {
		heading: "MCP сервері және WebMCP",
		lead: "Бір каталогқа екі жолмен қол жеткізу емес, екі түрлі транспорт. Pleiades екеуін де қолдайды.",
		noteStrong: "WebMCP — эксперименттік.",
		noteBefore:
			" Бұл W3C Community Group жобасы, Chrome-да ерте превью ретінде шыққан және әлі тұрақты кросс-браузерлік мүмкіндік емес. API беті әлі өзгеруде: жоба",
		noteTo: "күйінен",
		noteAfter:
			"күйіне ауысады. Chrome Status күтілетін релиз ретінде 2026 жылғы 3 қарашаға жоспарланған Chrome 157-ні көрсетеді — бұл мақсат, міндетті күн емес.",
		releaseTarget: "релиз мақсаты",
		colMcp: "MCP сервері",
		colWeb: "WebMCP",
		experimental: "(эксперименттік)",
		rows: [
			{
				label: "құралдар қайда орналасқан",
				mcp: "Оркестратор қол жеткізе алатын MCP серверінде (stdio / SSE).",
				web: "Келушінің браузерінде, виджет орнатылған бетте (navigator.modelContext).",
			},
			{
				label: "шақыруды кім орындайды",
				mcp: "Құралды сервердің өзі шақырады.",
				web: "Оны виджет браузерде шақырады; сервер жоспарды тоқтатып, нәтижемен жалғастырады.",
			},
			{
				label: "сайтқа не қажет",
				mcp: "Дүкеннің немесе сервистің жанында нақты MCP сервері.",
				web: "Беттерінде бұрыннан ашылған құралдардың өзі ғана — бэкенд интеграциясы қажет емес.",
			},
			{
				label: "келушінің күйін көреді",
				mcp: "Тек сервер білетінін.",
				web: "Иә: ашық бет, себет, таңдалған қала — келуші көретіндей.",
			},
			{
				label: "жетілгендік",
				mcp: "Қалыптасқан протокол.",
				web: "Эксперименттік браузер API; Chrome-да әзірге флаг артында.",
			},
		],
	},
	platforms: {
		heading: "ТМД-дағы шағын дүкендер шын мәнінде қайда тұрады",
		lead: "Шағын дүкендердің көбі Shopify-да емес, WooCommerce, OpenCart немесе 1С-Битрикс-те жұмыс істейді. Олардың ешқайсысы дайын сатып алу агентін қорапта бермейді. Pleiades — беттегі виджет, сондықтан ол CMS-тің «агентке дайын» болуын күтпейді.",
		items: [
			{
				name: "WordPress + WooCommerce",
				text: "WordPress-тің ресми MCP Adapter бар, ал WooCommerce 10.3 нұсқасынан бастап MCP интеграциясын жеткізеді. Екеуі де әлі ерте кезеңде: WooCommerce оны developer preview деп атайды.",
				status: "ресми, ерте",
			},
			{
				name: "1С-Битрикс",
				text: "Ресейдегі ең көп қолданылатын дүкен қозғалтқышы (дүкендердің шамамен 29%-ы, бірақ жартысынан астамы өзі жазған CMS-те жұмыс істейді). Битрикс24-тің ресми MCP серверлері бар; дүкен қозғалтқышының өзі үшін біз тек үшінші тарап әзірлеушілерінің құралдарын таптық.",
				status: "CRM ресми, дүкен: жоқ",
			},
			{
				name: "OpenCart",
				text: "Бөлек дүкен CMS-і, WordPress плагині емес. Ресми MCP жоқ; үшінші тарап кеңейтімдері бар, мысалы OpenCart маркетплейсіндегі EcomAiBridge.",
				status: "тек үшінші тарап",
			},
		],
	},
	benefits: {
		heading: "Артықшылықтар",
		items: [
			{
				title: "Шағын модельдер",
				text: "GPU жоқ және қымбат модельдерге бюджеті жоқ шағын бизнеске арналған.",
			},
			{
				title: "Промпт емес, жоспар",
				text: "GOAP мақсатқа апаратын әрекеттер тізбегін құрады, сондықтан шағын модель жолдан адаспайды.",
			},
			{
				title: "Сайтыңыздың құралдарын пайдаланады",
				text: "Тауар табу, себетке салу, салыстыру — сізде бұрыннан бар MCP / WebMCP құралдары арқылы.",
			},
			{
				title: "Self-hosted",
				text: "Бүкіл стек бір Linux-машинада Docker Compose арқылы жұмыс істейді. Деректеріңіз өзіңізде қалады.",
			},
			{
				title: "Жеңіл виджет",
				text: "Бір веб-компонент, brotli-мен 40 кБ-тан аз, React, Vue, Svelte-те және таза HTML-де жұмыс істейді.",
			},
			{
				title: "Әр шешім көрінеді",
				text: "Әкімші панелі әр сұранысты граф түрінде салады: промпт, қадамдар, құрал жауаптары, нәтиже.",
			},
		],
	},
	security: {
		heading: "Қауіпсіздік және кімге төленеді",
		lead: "Агентке кім ие болса, ұсынысқа, жарнамаға және клиентке сол ие болады. Осы беттегі әр протоколдың артындағы нақты сұрақ осы.",
		points: [
			{
				title: "Yandex-ке мұқият қарау керек",
				text: "Оның Commerce Protocol протоколы жабық және меншікті, MCP емес. Диалогтағы ұсыныстарды өзі саралайтын және олардың айналасында жарнама сататын жабық платформа өз нәтижелерін жоғары қоюға мүдделі. Дүкен жеткізушіге айналады, ал клиентпен қарым-қатынас пен жарнама бюджеті платформаға кетеді.",
			},
			{
				title: "Google-дың ашық протоколдары — қайырымдылық емес",
				text: "WebMCP және Universal Commerce Protocol ашық — әрі Google-дың өз іздеуіне, жарнамасына және Merchant Center-ге қызмет етеді. Сайттар құралдарын неғұрлым ашық көрсетсе, трафиктің соғұрлым көбі автоматты болады: дүкен бақыламайтын корпоративтік агенттер мен әр түрлі боттар.",
			},
			{
				title: "Ашық — әрі осал",
				text: "Браузер әзірлеушілері бір пікірде емес: Mozilla агенттердің пайдаланушыға көрінбей әрекет етуіне қарсы ескертпелер білдірді, ал WebKit сайттардың агенттерді адамдардан ажыратуына қарсы. Шектеулер, рұқсаттар және әрекеттер журналы дүкен жағында болуы керек.",
			},
			{
				title: "Дүкен өз клиентін өзінде сақтайды",
				text: "Pleiades сіздің серверіңізде жұмыс істейді. Ұсыныстар, клиент деректері және жарнама орны басқа біреудің нәтижелеріне кетпей, дүкеннің өз сайтында қалады. Әр жауаптың артындағы жоспар — оқуға болатын граф, ал құралдар — сайттың өзі ашқандар.",
			},
		],
		early: {
			heading: "Ерте кезең, белсенді әзірлеу жүріп жатыр",
			text: "Pleiades ерте кезеңде және белсенді әзірленуде: алғашқы коммит 2026 жылғы тамызда жасалған. Мүмкіндіктер мен API өзгереді, және біз көрсетпеген қауіпсіздік кепілдіктерін уәде етпейміз. AGPLv3 бойынша тегін; бір реттік коммерциялық лицензия жабық код үшін.",
		},
	},
	pricing: {
		heading: "Қауымдастық немесе бизнес",
		community: {
			title: "Қауымдастық",
			price: "тегін",
			text: "GNU AGPLv3 бойынша ашық код. Өзіңіз үшін іске қосыңыз, өзгертіңіз, үлес қосыңыз. Егер адамдарға өзгертілген нұсқаны желі арқылы пайдалануға берсеңіз, өз өзгерістеріңізді жариялайсыз.",
			cta: "бастапқы кодты алу",
		},
		business: {
			title: "Бизнес",
			oneTime: "бір рет",
			text: "Жабық код: оны жабық бастапқы кодты өнімге ендіру немесе өзгертілген нұсқаны жарияламай іске қосу. Мерзімсіз лицензия, барлық нұсқаларға жарамды. Қолдау кірмейді.",
			buy: "лицензия сатып алу",
			ask: "лицензия сұрау",
			terms: "лицензия шарттары",
		},
	},
};

const content: Record<Locale, LandingContent> = { en, ru, kk };

export function landingContent(locale?: string): LandingContent {
	return content[(locale || DEFAULT_LOCALE) as Locale] ?? en;
}
