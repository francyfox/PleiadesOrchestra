import { type Dictionary, t } from "intlayer";

const appSidebarContent = {
	key: "app-sidebar",
	content: {
		nav: {
			dashboard: t({ ru: "Дашборд", en: "Dashboard", kk: "Бақылау тақтасы" }),
			users: t({ ru: "Пользователи", en: "Users", kk: "Пайдаланушылар" }),
			goap: t({
				ru: "GOAP-действия",
				en: "GOAP actions",
				kk: "GOAP әрекеттері",
			}),
			agents: t({ ru: "Агенты", en: "Agents", kk: "Агенттер" }),
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
			channels: t({ ru: "Каналы", en: "Channels", kk: "Арналар" }),
			blockedIps: t({
				ru: "Блокировки IP",
				en: "IP blocks",
				kk: "IP бұғаттаулары",
			}),
			admins: t({ ru: "Администраторы", en: "Admins", kk: "Әкімшілер" }),
		},
		logout: t({ ru: "Выйти", en: "Log out", kk: "Шығу" }),
	},
} satisfies Dictionary;

export default appSidebarContent;
