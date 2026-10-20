import { type Dictionary, insert, t } from "intlayer";

const dashboardContent = {
	key: "dashboard",
	content: {
		title: t({ ru: "Дашборд", en: "Dashboard", kk: "Бақылау тақтасы" }),
		periods: {
			today: t({ ru: "Сегодня", en: "Today", kk: "Бүгін" }),
			last7d: t({ ru: "7 дней", en: "7 days", kk: "7 күн" }),
			last30d: t({ ru: "30 дней", en: "30 days", kk: "30 күн" }),
		},
		tokensFor: t({
			ru: insert("Токены — {{period}}"),
			en: insert("Tokens — {{period}}"),
			kk: insert("Токендер — {{period}}"),
		}),
		callsSummary: t({
			ru: insert("{{calls}} вызовов, без usage — {{share}}"),
			en: insert("{{calls}} calls, {{share}} without usage"),
			kk: insert("{{calls}} шақыру, usage жоқ — {{share}}"),
		}),
		visitors: t({ ru: "Посетители", en: "Visitors", kk: "Келушілер" }),
		pendingLink: t({
			ru: insert("ждут белого списка: {{count}}"),
			en: insert("awaiting whitelist: {{count}}"),
			kk: insert("ақ тізімді күтуде: {{count}}"),
		}),
		visitorsSummary: t({
			ru: insert("заблокировано: {{blocked}} · анонимных: {{anonymous}}"),
			en: insert("blocked: {{blocked}} · anonymous: {{anonymous}}"),
			kk: insert("бұғатталған: {{blocked}} · анонимді: {{anonymous}}"),
		}),
		usageByDay: t({
			ru: "Расход токенов по дням (30 дней)",
			en: "Token usage per day (30 days)",
			kk: "Күн бойынша токен шығыны (30 күн)",
		}),
		topVisitors: t({
			ru: "Топ посетителей по расходу",
			en: "Top visitors by usage",
			kk: "Шығын бойынша үздік келушілер",
		}),
		byChannel: t({
			ru: "Расход по каналам",
			en: "Usage by channel",
			kk: "Арналар бойынша шығын",
		}),
		byModel: t({
			ru: "Расход и цена по моделям",
			en: "Usage and price by model",
			kk: "Модельдер бойынша шығын және баға",
		}),
		spendByDay: t({
			ru: insert("Расход в долларах по дням (30 дней, всего {{total}})"),
			en: insert("Spend per day (30 days, {{total}} in total)"),
			kk: insert("Күн бойынша шығын (30 күн, барлығы {{total}})"),
		}),
		pricesNote: t({
			ru: "Цена — по тарифам OpenRouter на сегодня, применена ко всем токенам периода; локальные модели бесплатны. Нет цен — прочерк.",
			en: "Prices are OpenRouter's today, applied to all tokens of the period; local models are free. No prices — a dash.",
			kk: "Баға — OpenRouter-дің бүгінгі тарифі, кезеңнің барлық токендеріне қолданылған; жергілікті модельдер тегін. Баға жоқ — сызықша.",
		}),
		columns: {
			model: t({ ru: "Модель", en: "Model", kk: "Модель" }),
			spend: t({ ru: "Расход", en: "Spend", kk: "Шығын" }),
			price: t({
				ru: "Цена за 1M (вход / выход)",
				en: "Price per 1M (in / out)",
				kk: "1M үшін баға (кіріс / шығыс)",
			}),
			visitor: t({ ru: "Посетитель", en: "Visitor", kk: "Келуші" }),
			channel: t({ ru: "Канал", en: "Channel", kk: "Арна" }),
			input: t({ ru: "Вход", en: "Input", kk: "Кіріс" }),
			output: t({ ru: "Выход", en: "Output", kk: "Шығыс" }),
			calls: t({ ru: "Вызовов", en: "Calls", kk: "Шақырулар" }),
			avgLatency: t({
				ru: "Ср. латентность",
				en: "Avg latency",
				kk: "Орт. кідіріс",
			}),
		},
	},
} satisfies Dictionary;

export default dashboardContent;
