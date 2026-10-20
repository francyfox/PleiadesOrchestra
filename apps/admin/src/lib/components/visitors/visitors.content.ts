import { type Dictionary, insert, t } from "intlayer";

const visitorsContent = {
	key: "visitors",
	content: {
		title: t({ ru: "Посетители", en: "Visitors", kk: "Келушілер" }),
		columns: {
			visitor: t({ ru: "Посетитель", en: "Visitor", kk: "Келуші" }),
			channel: t({ ru: "Канал", en: "Channel", kk: "Арна" }),
			ip: t({ ru: "IP", en: "IP", kk: "IP" }),
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
		copyId: t({ ru: "Копировать id", en: "Copy id", kk: "id көшіру" }),
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
			en: "No visitors found",
			kk: "Келушілер табылмады",
		}),
	},
} satisfies Dictionary;

export default visitorsContent;
