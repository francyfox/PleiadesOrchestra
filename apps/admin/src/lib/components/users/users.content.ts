import { type Dictionary, insert, t } from "intlayer";

const usersContent = {
	key: "users",
	content: {
		title: t({ ru: "Пользователи", en: "Users", kk: "Пайдаланушылар" }),
		columns: {
			user: t({ ru: "Пользователь", en: "User", kk: "Пайдаланушы" }),
			channel: t({ ru: "Канал", en: "Channel", kk: "Арна" }),
			status: t({ ru: "Статус", en: "Status", kk: "Күйі" }),
			lastSeen: t({ ru: "Активность", en: "Last seen", kk: "Белсенділік" }),
			created: t({ ru: "Создан", en: "Created", kk: "Құрылған" }),
			tokens: t({ ru: "Токены", en: "Tokens", kk: "Токендер" }),
		},
		selectAll: t({
			ru: "Выбрать все",
			en: "Select all",
			kk: "Барлығын таңдау",
		}),
		selectRow: t({ ru: "Выбрать", en: "Select", kk: "Таңдау" }),
		anonymous: t({ ru: "аноним", en: "anonymous", kk: "аноним" }),
		filters: {
			search: t({
				ru: "Имя или внешний id",
				en: "Name or external id",
				kk: "Аты немесе сыртқы id",
			}),
			allChannels: t({
				ru: "Все каналы",
				en: "All channels",
				kk: "Барлық арналар",
			}),
			anyStatus: t({
				ru: "Любой статус",
				en: "Any status",
				kk: "Кез келген күй",
			}),
			allKinds: t({ ru: "Все", en: "All", kk: "Барлығы" }),
			identified: t({
				ru: "Идентифицированные",
				en: "Identified",
				kk: "Танылғандар",
			}),
			anonymous: t({ ru: "Анонимные", en: "Anonymous", kk: "Анонимділер" }),
			apply: t({ ru: "Применить", en: "Apply", kk: "Қолдану" }),
			reset: t({ ru: "Сбросить", en: "Reset", kk: "Тазалау" }),
		},
		bulk: {
			selected: t({
				ru: insert("Выбрано: {{count}}"),
				en: insert("Selected: {{count}}"),
				kk: insert("Таңдалды: {{count}}"),
			}),
			reason: t({
				ru: "Причина блокировки (необязательно)",
				en: "Block reason (optional)",
				kk: "Бұғаттау себебі (міндетті емес)",
			}),
		},
		empty: t({
			ru: "Пользователей не найдено",
			en: "No users found",
			kk: "Пайдаланушылар табылмады",
		}),
		total: t({
			ru: insert("Всего: {{count}}"),
			en: insert("Total: {{count}}"),
			kk: insert("Барлығы: {{count}}"),
		}),
		prev: t({ ru: "Назад", en: "Previous", kk: "Артқа" }),
		next: t({ ru: "Дальше", en: "Next", kk: "Келесі" }),
	},
} satisfies Dictionary;

export default usersContent;
