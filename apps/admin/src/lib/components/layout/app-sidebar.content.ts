import { type Dictionary, t } from "intlayer";

const appSidebarContent = {
	key: "app-sidebar",
	content: {
		nav: {
			dashboard: t({ ru: "Дашборд", en: "Dashboard", kk: "Бақылау тақтасы" }),
			visitors: t({ ru: "Посетители", en: "Visitors", kk: "Келушілер" }),
			users: t({ ru: "Пользователи", en: "Users", kk: "Пайдаланушылар" }),
			settings: t({ ru: "Настройки", en: "Settings", kk: "Параметрлер" }),
			flow: t({
				ru: "Flow — запросы",
				en: "Flow requests",
				kk: "Flow сұраулары",
			}),
			intents: t({ ru: "Намерения", en: "Intents", kk: "Ниеттер" }),
			mcp: t({ ru: "MCP", en: "MCP", kk: "MCP" }),
			agents: t({ ru: "Агенты", en: "Agents", kk: "Агенттер" }),
			models: t({ ru: "Модели", en: "Models", kk: "Модельдер" }),
			performance: t({
				ru: "Производительность",
				en: "Performance",
				kk: "Өнімділік",
			}),
			recommendations: t({
				ru: "Рекомендации",
				en: "Recommendations",
				kk: "Ұсыныстар",
			}),
			plans: t({ ru: "Тарифы", en: "Plans", kk: "Тарифтер" }),
			channels: t({ ru: "Каналы", en: "Channels", kk: "Арналар" }),
			billing: t({ ru: "Оплата", en: "Billing", kk: "Төлем" }),
			blockedIps: t({
				ru: "Блокировки IP",
				en: "IP blocks",
				kk: "IP бұғаттаулары",
			}),
			admins: t({ ru: "Администраторы", en: "Admins", kk: "Әкімшілер" }),
			faq: t({ ru: "FAQ", en: "FAQ", kk: "FAQ" }),
		},
		logout: t({ ru: "Выйти", en: "Log out", kk: "Шығу" }),
	},
} satisfies Dictionary;

export default appSidebarContent;
