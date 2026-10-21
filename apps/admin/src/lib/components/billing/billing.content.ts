import { type Dictionary, insert, t } from "intlayer";

const billingContent = {
	key: "billing",
	content: {
		title: t({ ru: "Оплата", en: "Billing", kk: "Төлем" }),
		checkoutSuccess: t({
			ru: "Спасибо! Платёж принят, данные обновляются.",
			en: "Thank you! The payment went through, refreshing your data.",
			kk: "Рақмет! Төлем қабылданды, деректер жаңартылуда.",
		}),
		unavailable: t({
			ru: "Оплата не настроена.",
			en: "Billing is not configured.",
			kk: "Төлем бапталмаған.",
		}),
		summary: {
			title: t({
				ru: "Тариф и баланс",
				en: "Plan and balance",
				kk: "Тариф және баланс",
			}),
			plan: t({ ru: "Тариф", en: "Plan", kk: "Тариф" }),
			noPlan: t({ ru: "нет тарифа", en: "no plan", kk: "тариф жоқ" }),
			expires: t({
				ru: "Действует до",
				en: "Valid until",
				kk: "Жарамды мерзімі",
			}),
			balance: t({ ru: "Баланс", en: "Balance", kk: "Баланс" }),
			overdraft: t({ ru: "овердрафт", en: "overdraft", kk: "овердрафт" }),
			channels: t({ ru: "Каналы", en: "Channels", kk: "Арналар" }),
			ok: t({ ru: "работают", en: "running", kk: "жұмыс істеуде" }),
			paused: t({ ru: "приостановлены", en: "paused", kk: "тоқтатылған" }),
		},
		reasons: {
			no_plan: t({ ru: "нет тарифа", en: "no plan", kk: "тариф жоқ" }),
			plan_expired: t({
				ru: "тариф истёк",
				en: "plan expired",
				kk: "тариф аяқталды",
			}),
			no_balance: t({ ru: "нет трени", en: "no trenni", kk: "трени жоқ" }),
		},
		actions: {
			title: t({ ru: "Оплата", en: "Payment", kk: "Төлем" }),
			subscribe: t({
				ru: "Оформить / продлить тариф",
				en: "Subscribe / Renew plan",
				kk: "Тарифті рәсімдеу / ұзарту",
			}),
			amount: t({
				ru: "Сумма пополнения, USD (1 TR = 1 USD)",
				en: "Top-up amount, USD (1 TR = 1 USD)",
				kk: "Толықтыру сомасы, USD (1 TR = 1 USD)",
			}),
			topUp: t({ ru: "Пополнить", en: "Top up", kk: "Толықтыру" }),
			manage: t({
				ru: "Управление оплатой",
				en: "Manage payment",
				kk: "Төлемді басқару",
			}),
		},
		orders: {
			title: t({
				ru: "История платежей",
				en: "Payment history",
				kk: "Төлем тарихы",
			}),
			date: t({ ru: "Дата", en: "Date", kk: "Күні" }),
			kind: t({ ru: "Тип", en: "Type", kk: "Түрі" }),
			amount: t({ ru: "Сумма", en: "Amount", kk: "Сома" }),
			status: t({ ru: "Статус", en: "Status", kk: "Күйі" }),
			refunded: t({ ru: "Возвращено", en: "Refunded", kk: "Қайтарылған" }),
			plan: t({ ru: "тариф", en: "plan", kk: "тариф" }),
			credits: t({ ru: "трени", en: "trenni", kk: "трени" }),
			empty: t({
				ru: "Платежей пока нет",
				en: "No payments yet",
				kk: "Төлемдер әлі жоқ",
			}),
		},
		spend: {
			title: t({
				ru: "Расход по месяцам",
				en: "Monthly spend",
				kk: "Айлар бойынша шығын",
			}),
			month: t({ ru: "Месяц", en: "Month", kk: "Ай" }),
			tokens: t({ ru: "Токены", en: "Tokens", kk: "Токендер" }),
			cost: t({ ru: "Стоимость, USD", en: "Cost, USD", kk: "Құны, USD" }),
			empty: t({
				ru: "Расходов пока нет",
				en: "No spend yet",
				kk: "Шығын әлі жоқ",
			}),
		},
		alert: {
			renewPlan: t({
				ru: "Ваши каналы приостановлены: продлите тариф",
				en: "Your channels are paused: renew the plan",
				kk: "Арналарыңыз тоқтатылған: тарифті ұзартыңыз",
			}),
			topUp: t({
				ru: "Ваши каналы приостановлены: пополните трени",
				en: "Your channels are paused: top up trenni",
				kk: "Арналарыңыз тоқтатылған: трениді толықтырыңыз",
			}),
			lowBalance: t({
				ru: "Баланс трени почти исчерпан: пополните, чтобы каналы не остановились",
				en: "Your trenni balance is almost used up: top up so channels keep running",
				kk: "Трени балансы таусылуға жақын: арналар тоқтамас үшін толықтырыңыз",
			}),
			planEnding: t({
				ru: "Тариф скоро закончится: продлите, чтобы каналы не остановились",
				en: "Your plan ends soon: renew it so channels keep running",
				kk: "Тариф жақында аяқталады: арналар тоқтамас үшін ұзартыңыз",
			}),
			link: t({ ru: "Открыть оплату", en: "Open billing", kk: "Төлемді ашу" }),
		},
		staff: {
			open: t({ ru: "Оплата", en: "Billing", kk: "Төлем" }),
			title: t({
				ru: insert("Оплата: {{email}}"),
				en: insert("Billing: {{email}}"),
				kk: insert("Төлем: {{email}}"),
			}),
		},
		errors: {
			billing_unavailable: t({
				ru: "Оплата не настроена",
				en: "Billing is not configured",
				kk: "Төлем бапталмаған",
			}),
			billing_failed: t({
				ru: "Polar не ответил, попробуйте позже",
				en: "Polar didn't respond, try again later",
				kk: "Polar жауап бермеді, кейінірек қайталаңыз",
			}),
			upstream_unavailable: t({
				ru: "Оркестратор недоступен",
				en: "The orchestrator is unavailable",
				kk: "Оркестратор қолжетімсіз",
			}),
		},
	},
} satisfies Dictionary;

export default billingContent;
