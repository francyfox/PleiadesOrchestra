import { type Dictionary, insert, t } from "intlayer";

const mcpContent = {
	key: "mcp",
	content: {
		title: t({ ru: "MCP", en: "MCP", kk: "MCP" }),
		hint: t({
			ru: "Функции (WebMCP-тулы), которые страницы сайтов объявили, когда посетитель открыл виджет. Берётся последняя версия каталога сайта; одинаковые каталоги не классифицируются заново.",
			en: "Functions (WebMCP tools) the sites' pages announced when a visitor opened the widget. The newest catalog version of each site is shown; identical catalogs are not classified again.",
			kk: "Келуші виджетті ашқанда сайт беттері жариялаған функциялар (WebMCP-тулдар). Әр сайттың каталогының соңғы нұсқасы көрсетіледі; бірдей каталогтар қайта жіктелмейді.",
		}),
		back: t({ ru: "Все сайты", en: "All sites", kk: "Барлық сайттар" }),
		detail: {
			tools: t({
				ru: insert("функций: {{count}}"),
				en: insert("{{count}} functions"),
				kk: insert("функциялар: {{count}}"),
			}),
			versions: t({
				ru: insert("версий: {{count}}"),
				en: insert("{{count}} versions"),
				kk: insert("нұсқалар: {{count}}"),
			}),
			lastSeen: t({
				ru: insert("последний раз {{time}}"),
				en: insert("last seen {{time}}"),
				kk: insert("соңғы рет {{time}}"),
			}),
		},
		sites: {
			title: t({ ru: "Сайты", en: "Sites", kk: "Сайттар" }),
			empty: t({
				ru: "Ни один сайт ещё не объявлял функции. Откройте виджет на странице с WebMCP-тулами.",
				en: "No site has announced functions yet. Open the widget on a page that exposes WebMCP tools.",
				kk: "Әзірге ешбір сайт функция жарияламады. WebMCP-тулдары бар бетте виджетті ашыңыз.",
			}),
			columns: {
				site: t({ ru: "Сайт", en: "Site", kk: "Сайт" }),
				tools: t({ ru: "Функций", en: "Functions", kk: "Функциялар" }),
				versions: t({ ru: "Версий", en: "Versions", kk: "Нұсқалар" }),
				announced: t({
					ru: "Объявлено раз",
					en: "Announced",
					kk: "Жарияланды",
				}),
				changed: t({ ru: "Версия с", en: "Version since", kk: "Нұсқа бастап" }),
				lastSeen: t({ ru: "Последний раз", en: "Last seen", kk: "Соңғы рет" }),
			},
		},
		tools: {
			empty: t({
				ru: "У сайта нет функций",
				en: "The site has no functions",
				kk: "Сайтта функциялар жоқ",
			}),
			columns: {
				name: t({ ru: "Функция", en: "Function", kk: "Функция" }),
				description: t({ ru: "Описание", en: "Description", kk: "Сипаттама" }),
				params: t({ ru: "Параметры", en: "Parameters", kk: "Параметрлер" }),
			},
			noParams: t({
				ru: "без параметров",
				en: "no parameters",
				kk: "параметрсіз",
			}),
			required: t({ ru: "обязательный", en: "required", kk: "міндетті" }),
		},
	},
} satisfies Dictionary;

export default mcpContent;
