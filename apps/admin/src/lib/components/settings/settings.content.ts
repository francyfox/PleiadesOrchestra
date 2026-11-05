import { type Dictionary, insert, t } from "intlayer";

const settingsContent = {
	key: "settings",
	content: {
		title: t({ ru: "Настройки", en: "Settings", kk: "Параметрлер" }),
		polarSync: {
			title: t({
				ru: "Синхронизация с Polar",
				en: "Polar sync",
				kk: "Polar синхрондау",
			}),
			description: t({
				ru: "Забирает из Polar все подписки и заказы и применяет их так же, как вебхуки. Нужна, если вебхук не дошёл.",
				en: "Pulls every subscription and order from Polar and applies them like webhooks. Use it when a webhook did not arrive.",
				kk: "Polar-дан барлық жазылымдар мен тапсырыстарды алып, вебхуктар сияқты қолданады. Вебхук жетпесе қажет.",
			}),
			action: t({
				ru: "Синхронизировать Polar",
				en: "Sync Polar",
				kk: "Polar синхрондау",
			}),
			done: t({
				ru: insert(
					"Готово: применено {{applied}}, без изменений {{unchanged}}, пропущено {{skipped}}",
				),
				en: insert(
					"Done: {{applied}} applied, {{unchanged}} unchanged, {{skipped}} skipped",
				),
				kk: insert(
					"Дайын: қолданылды {{applied}}, өзгеріссіз {{unchanged}}, өткізілді {{skipped}}",
				),
			}),
			billing_unavailable: t({
				ru: "Polar не настроен: нет POLAR_ACCESS_TOKEN",
				en: "Polar is not configured: no POLAR_ACCESS_TOKEN",
				kk: "Polar бапталмаған: POLAR_ACCESS_TOKEN жоқ",
			}),
			billing_failed: t({
				ru: "Polar отказал: проверьте scope токена (subscriptions:read, orders:read)",
				en: "Polar refused: check the token scopes (subscriptions:read, orders:read)",
				kk: "Polar бас тартты: токен scope-ын тексеріңіз (subscriptions:read, orders:read)",
			}),
		},
		financeRates: {
			title: t({
				ru: "Ставки финансов",
				en: "Finance rates",
				kk: "Қаржы мөлшерлемелері",
			}),
			note: t({
				ru: "Это оценка по вашим ставкам, а не расчёт налога.",
				en: "This is an estimate by your own rates, not a tax calculation.",
				kk: "Бұл салықты есептеу емес, өз мөлшерлемелеріңіз бойынша бағалау.",
			}),
			feeFixedUsd: t({
				ru: "Фиксированная комиссия за заказ, $",
				en: "Fixed fee per order, $",
				kk: "Тапсырыс үшін тіркелген комиссия, $",
			}),
			feePercent: t({
				ru: "Комиссия платёжки, %",
				en: "Payment fee, %",
				kk: "Төлем комиссиясы, %",
			}),
			payoutPercent: t({
				ru: "Комиссия за вывод, %",
				en: "Payout fee, %",
				kk: "Шығару комиссиясы, %",
			}),
			taxPercent: t({ ru: "Налог, %", en: "Tax, %", kk: "Салық, %" }),
			conversionPercent: t({
				ru: "Конвертация, %",
				en: "Conversion, %",
				kk: "Айырбастау, %",
			}),
			marginPercent: t({
				ru: "Маржа с остатка, %",
				en: "Margin on the net, %",
				kk: "Таза соммадан маржа, %",
			}),
			preview: t({
				ru: "Пополнение: оплачено, TR на баланс, чистыми вам",
				en: "Top-up: paid, TR credited, net to you",
				kk: "Толтыру: төленді, TR балансқа, сізге таза",
			}),
			taxBase: t({
				ru: "Налог считается с",
				en: "Tax is taken from",
				kk: "Салық есептелетін база",
			}),
			base: {
				payout: t({ ru: "Выплаты", en: "Payout", kk: "Төлем" }),
				revenue: t({ ru: "Выручки", en: "Revenue", kk: "Түсім" }),
				profit: t({ ru: "Прибыли", en: "Profit", kk: "Пайда" }),
			},
			saved: t({
				ru: "Ставки сохранены",
				en: "Rates saved",
				kk: "Мөлшерлемелер сақталды",
			}),
		},
		profile: {
			title: t({ ru: "Профиль", en: "Profile", kk: "Профиль" }),
			name: t({ ru: "Имя", en: "Name", kk: "Аты" }),
			email: t({ ru: "Новая почта", en: "New email", kk: "Жаңа пошта" }),
			currentEmail: t({
				ru: insert("Сейчас: {{email}}"),
				en: insert("Current: {{email}}"),
				kk: insert("Қазіргі: {{email}}"),
			}),
			changeEmail: t({
				ru: "Сменить почту",
				en: "Change email",
				kk: "Поштаны өзгерту",
			}),
			emailSent: t({
				ru: "Мы отправили ссылку на новый адрес; почта изменится после подтверждения",
				en: "We sent a link to the new address; the email changes after you confirm it",
				kk: "Жаңа мекенжайға сілтеме жібердік; пошта растағаннан кейін өзгереді",
			}),
		},
		inactivity: t({
			ru: insert(
				"Аккаунты без активности 6 месяцев удаляются автоматически. Последняя активность: {{date}}",
			),
			en: insert(
				"Accounts inactive for 6 months are deleted automatically. Last activity: {{date}}",
			),
			kk: insert(
				"6 ай белсенділігі жоқ тіркелгілер автоматты түрде жойылады. Соңғы белсенділік: {{date}}",
			),
		}),
		neverActive: t({ ru: "ещё не было", en: "none yet", kk: "әлі болған жоқ" }),
		danger: {
			title: t({ ru: "Опасная зона", en: "Danger zone", kk: "Қауіпті аймақ" }),
			body: t({
				ru: "Удаление аккаунта удаляет все ваши каналы и данные их посетителей. Это нельзя отменить.",
				en: "Deleting the account deletes all your channels and their visitors' data. It can't be undone.",
				kk: "Тіркелгіні жою барлық арналарыңызды және олардың келушілерінің деректерін жояды. Мұны қайтару мүмкін емес.",
			}),
			action: t({
				ru: "Удалить аккаунт",
				en: "Delete account",
				kk: "Тіркелгіні жою",
			}),
			dialogTitle: t({
				ru: "Удалить аккаунт?",
				en: "Delete your account?",
				kk: "Тіркелгіні жою керек пе?",
			}),
			confirmLabel: t({
				ru: insert("Введите {{email}}, чтобы подтвердить"),
				en: insert("Type {{email}} to confirm"),
				kk: insert("Растау үшін {{email}} енгізіңіз"),
			}),
		},
		errors: {
			invalid_name: t({
				ru: "Укажите имя",
				en: "Enter a name",
				kk: "Атын енгізіңіз",
			}),
			invalid_email: t({
				ru: "Некорректный адрес почты",
				en: "That email address isn't valid",
				kk: "Пошта мекенжайы жарамсыз",
			}),
			same_email: t({
				ru: "Это уже ваша почта",
				en: "That is already your email",
				kk: "Бұл қазірдің өзінде сіздің поштаңыз",
			}),
			confirm_mismatch: t({
				ru: "Почта не совпадает с адресом аккаунта",
				en: "That doesn't match your account email",
				kk: "Пошта тіркелгі мекенжайымен сәйкес келмейді",
			}),
			too_many_attempts: t({
				ru: "Слишком много попыток, попробуйте позже",
				en: "Too many attempts, try again later",
				kk: "Тым көп әрекет, кейінірек қайталаңыз",
			}),
			upstream_unavailable: t({
				ru: "Оркестратор недоступен, аккаунт сохранён",
				en: "The orchestrator is unavailable, the account was kept",
				kk: "Оркестратор қолжетімсіз, тіркелгі сақталды",
			}),
		},
	},
} satisfies Dictionary;

export default settingsContent;
