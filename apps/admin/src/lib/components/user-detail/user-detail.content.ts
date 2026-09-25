import { type Dictionary, insert, t } from "intlayer";

const userDetailContent = {
	key: "user-detail",
	content: {
		anonymousUser: t({
			ru: "Анонимный пользователь",
			en: "Anonymous user",
			kk: "Анонимді пайдаланушы",
		}),
		channelId: t({
			ru: insert("id в канале: {{id}}"),
			en: insert("channel id: {{id}}"),
			kk: insert("арнадағы id: {{id}}"),
		}),
		stats: {
			tokensTotal: t({
				ru: "Токены (всего)",
				en: "Tokens (total)",
				kk: "Токендер (барлығы)",
			}),
			tokensSplit: t({
				ru: insert("вход {{input}} · выход {{output}}"),
				en: insert("input {{input}} · output {{output}}"),
				kk: insert("кіріс {{input}} · шығыс {{output}}"),
			}),
			calls: t({
				ru: "Вызовов модели",
				en: "Model calls",
				kk: "Модель шақырулары",
			}),
			withoutUsage: t({
				ru: insert("без usage: {{count}}"),
				en: insert("without usage: {{count}}"),
				kk: insert("usage жоқ: {{count}}"),
			}),
			lastSeen: t({
				ru: "Последняя активность",
				en: "Last seen",
				kk: "Соңғы белсенділік",
			}),
			created: t({
				ru: insert("создан {{date}}"),
				en: insert("created {{date}}"),
				kk: insert("құрылған {{date}}"),
			}),
			access: t({ ru: "Доступ", en: "Access", kk: "Қолжетімділік" }),
			blocked: t({ ru: "заблокирован", en: "blocked", kk: "бұғатталған" }),
			whitelisted: t({
				ru: "в белом списке",
				en: "whitelisted",
				kk: "ақ тізімде",
			}),
			since: t({
				ru: insert("с {{date}}"),
				en: insert("since {{date}}"),
				kk: insert("{{date}} бастап"),
			}),
		},
		usageByDay: t({
			ru: "Расход по дням (30 дней)",
			en: "Usage per day (30 days)",
			kk: "Күн бойынша шығын (30 күн)",
		}),
		usageByModel: t({
			ru: "Расход по моделям",
			en: "Usage by model",
			kk: "Модельдер бойынша шығын",
		}),
		columns: {
			model: t({ ru: "Модель", en: "Model", kk: "Модель" }),
			kind: t({ ru: "Тип вызова", en: "Call type", kk: "Шақыру түрі" }),
			input: t({ ru: "Вход", en: "Input", kk: "Кіріс" }),
			output: t({ ru: "Выход", en: "Output", kk: "Шығыс" }),
			calls: t({ ru: "Вызовов", en: "Calls", kk: "Шақырулар" }),
			withoutUsage: t({
				ru: "Без usage",
				en: "Without usage",
				kk: "Usage жоқ",
			}),
			avgLatency: t({
				ru: "Ср. латентность",
				en: "Avg latency",
				kk: "Орт. кідіріс",
			}),
		},
		messages: {
			title: t({
				ru: insert("Последние сообщения ({{count}} из ≤10)"),
				en: insert("Recent messages ({{count}} of ≤10)"),
				kk: insert("Соңғы хабарламалар (≤10 ішінен {{count}})"),
			}),
			erase: t({
				ru: "Стереть сообщения",
				en: "Erase messages",
				kk: "Хабарламаларды өшіру",
			}),
			none: t({
				ru: "Сообщений нет.",
				en: "No messages.",
				kk: "Хабарламалар жоқ.",
			}),
			viewportLabel: t({
				ru: "Последние сообщения пользователя",
				en: "User's recent messages",
				kk: "Пайдаланушының соңғы хабарламалары",
			}),
			thread: t({
				ru: insert("тред {{id}}"),
				en: insert("thread {{id}}"),
				kk: insert("тред {{id}}"),
			}),
			tokens: t({
				ru: insert("{{input}} → {{output}} ток., {{latency}}"),
				en: insert("{{input}} → {{output}} tok., {{latency}}"),
				kk: insert("{{input}} → {{output}} ток., {{latency}}"),
			}),
			plan: t({ ru: "план", en: "plan", kk: "жоспар" }),
		},
		blockDialog: {
			title: t({
				ru: "Заблокировать пользователя?",
				en: "Block this user?",
				kk: "Пайдаланушыны бұғаттау керек пе?",
			}),
			description: t({
				ru: "Оркестратор перестанет ему отвечать — молча, модель не вызывается.",
				en: "The orchestrator will stop answering them — silently, without calling the model.",
				kk: "Оркестратор оған жауап беруді тоқтатады — үнсіз, модель шақырылмайды.",
			}),
			reason: t({
				ru: "Причина (необязательно)",
				en: "Reason (optional)",
				kk: "Себебі (міндетті емес)",
			}),
		},
		eraseDialog: {
			title: t({
				ru: "Стереть сообщения пользователя?",
				en: "Erase this user's messages?",
				kk: "Пайдаланушының хабарламаларын өшіру керек пе?",
			}),
			description: t({
				ru: "Журнал расхода токенов останется.",
				en: "The token usage ledger is kept.",
				kk: "Токен шығыны журналы сақталады.",
			}),
			submit: t({ ru: "Стереть", en: "Erase", kk: "Өшіру" }),
		},
	},
} satisfies Dictionary;

export default userDetailContent;
