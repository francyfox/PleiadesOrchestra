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
		users: t({ ru: "Пользователи", en: "Users", kk: "Пайдаланушылар" }),
		pendingLink: t({
			ru: insert("ждут белого списка: {{count}}"),
			en: insert("awaiting whitelist: {{count}}"),
			kk: insert("ақ тізімді күтуде: {{count}}"),
		}),
		usersSummary: t({
			ru: insert("заблокировано: {{blocked}} · анонимных: {{anonymous}}"),
			en: insert("blocked: {{blocked}} · anonymous: {{anonymous}}"),
			kk: insert("бұғатталған: {{blocked}} · анонимді: {{anonymous}}"),
		}),
		usageByDay: t({
			ru: "Расход токенов по дням (30 дней)",
			en: "Token usage per day (30 days)",
			kk: "Күн бойынша токен шығыны (30 күн)",
		}),
		topUsers: t({
			ru: "Топ пользователей по расходу",
			en: "Top users by usage",
			kk: "Шығын бойынша үздік пайдаланушылар",
		}),
		byChannel: t({
			ru: "Расход по каналам",
			en: "Usage by channel",
			kk: "Арналар бойынша шығын",
		}),
		columns: {
			user: t({ ru: "Пользователь", en: "User", kk: "Пайдаланушы" }),
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
