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
				ru: "Оформить подписку",
				en: "Subscribe",
				kk: "Жазылу",
			}),
			topsUp: t({
				ru: "Каждый месяц пополняет баланс на 20 TR. Остаток не сгорает и после отмены.",
				en: "Tops your balance up by 20 TR every month. What is left never expires, even after you cancel.",
				kk: "Әр ай сайын балансты 20 TR-ге толықтырады. Қалдық күймейді, тіпті бас тартқаннан кейін де.",
			}),
			// The Cloud plan is a fixed $20/month (docs landing pricing); the price itself sits in billing-actions.svelte.
			perMonth: t({ ru: "в месяц", en: "per month", kk: "айына" }),
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
			credited: t({ ru: "Начислено", en: "Credited", kk: "Есептелген" }),
			heldBack: t({
				ru: "Комиссии, налоги и сервис",
				en: "Fees, taxes and service",
				kk: "Комиссия, салық және сервис",
			}),
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
			cost: t({ ru: "Стоимость, TR", en: "Cost, TR", kk: "Құны, TR" }),
			empty: t({
				ru: "Расходов пока нет",
				en: "No spend yet",
				kk: "Шығын әлі жоқ",
			}),
		},
		cancel: {
			action: t({
				ru: "Отменить подписку",
				en: "Cancel subscription",
				kk: "Жазылымнан бас тарту",
			}),
			title: t({
				ru: "Отменить подписку?",
				en: "Cancel the subscription?",
				kk: "Жазылымнан бас тарту керек пе?",
			}),
			description: t({
				ru: "Новых списаний не будет. Оплаченный месяц и остаток баланса сохранятся: каналы работают, пока баланса хватает на запрос.",
				en: "No further charges. The paid month and your balance stay: channels run while the balance covers a request.",
				kk: "Жаңа төлемдер болмайды. Төленген ай мен баланс қалдығы сақталады: баланс сұрауға жеткенше арналар жұмыс істейді.",
			}),
			done: t({
				ru: "Подписка отменена: новых списаний не будет",
				en: "Subscription canceled: no further charges",
				kk: "Жазылымнан бас тартылды: жаңа төлемдер болмайды",
			}),
		},
		alert: {
			renewPlan: t({
				ru: "Ваши каналы приостановлены: баланс исчерпан, оформите подписку",
				en: "Your channels are paused: the balance is used up, subscribe",
				kk: "Арналарыңыз тоқтатылған: баланс таусылды, жазылыңыз",
			}),
			topUp: t({
				ru: "Ваши каналы приостановлены: баланс исчерпан до следующего списания подписки",
				en: "Your channels are paused: the balance is used up until the next subscription charge",
				kk: "Арналарыңыз тоқтатылған: баланс келесі жазылым төлеміне дейін таусылды",
			}),
			lowBalance: t({
				ru: "Баланс трени почти исчерпан: каналы остановятся, когда его не хватит на запрос",
				en: "Your trenni balance is almost used up: channels stop when it can no longer cover a request",
				kk: "Трени балансы таусылуға жақын: сұрауға жетпегенде арналар тоқтайды",
			}),
			planEnding: t({
				ru: "Тариф скоро закончится: продлите, чтобы каналы не остановились",
				en: "Your plan ends soon: renew it so channels keep running",
				kk: "Тариф жақында аяқталады: арналар тоқтамас үшін ұзартыңыз",
			}),
			link: t({ ru: "Открыть оплату", en: "Open billing", kk: "Төлемді ашу" }),
		},
		noBalance: {
			title: t({
				ru: "Сэр, тут не хватает на топливо!",
				en: "Sir, we're short on fuel!",
				kk: "Мырза, отынға жетпей тұр!",
			}),
			body: t({
				ru: "Уважаемый господин, на вашем балансе недостаточно средств, но мы уже прогреваем наших агентов в ожидании вас. Всего хорошего.",
				en: "Dear sir, your balance is too low, but we are already warming up our agents while we wait for you. All the best.",
				kk: "Құрметті мырза, балансыңызда қаражат жеткіліксіз, бірақ біз сізді күтіп, агенттерімізді жылытып жатырмыз. Сау болыңыз.",
			}),
			topUp: t({ ru: "Пополнить", en: "Top up", kk: "Толтыру" }),
			ok: t({ ru: "ОК", en: "OK", kk: "ОК" }),
			imageAlt: t({
				ru: "Шесть горничных на вертеле над углями",
				en: "Six maids on a spit over the coals",
				kk: "Шоқ үстіндегі шампурдағы алты қызметші",
			}),
		},
		staff: {
			open: t({ ru: "Оплата", en: "Billing", kk: "Төлем" }),
			corrections: t({
				ru: "Ручная корректировка",
				en: "Manual correction",
				kk: "Қолмен түзету",
			}),
			amount: t({
				ru: "Изменить баланс на, TR (минус — списать)",
				en: "Change balance by, TR (minus takes away)",
				kk: "Балансты өзгерту, TR (минус — алып тастау)",
			}),
			apply: t({ ru: "Применить", en: "Apply", kk: "Қолдану" }),
			balanceDone: t({
				ru: "Баланс изменён",
				en: "Balance changed",
				kk: "Баланс өзгертілді",
			}),
			days: t({
				ru: "Выдать тариф на, дней (0 — завершить)",
				en: "Grant the plan for, days (0 ends it)",
				kk: "Тарифті беру, күн (0 — аяқтау)",
			}),
			planNote: t({
				ru: "Тариф вне Polar, без продления и без пополнения баланса.",
				en: "A plan outside Polar: no renewal, no balance top-up.",
				kk: "Polar-дан тыс тариф: ұзартусыз, баланс толтырусыз.",
			}),
			planDone: t({
				ru: "Тариф изменён",
				en: "Plan changed",
				kk: "Тариф өзгертілді",
			}),
			title: t({
				ru: insert("Оплата: {{email}}"),
				en: insert("Billing: {{email}}"),
				kk: insert("Төлем: {{email}}"),
			}),
		},
		errors: {
			no_subscription: t({
				ru: "Нет действующей подписки",
				en: "No running subscription",
				kk: "Белсенді жазылым жоқ",
			}),
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
