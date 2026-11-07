import { type Dictionary, t } from "intlayer";

const webhooksContent = {
	key: "webhooks",
	content: {
		title: t({ ru: "Уведомления", en: "Notifications", kk: "Хабарламалар" }),
		subtitle: t({
			ru: "Вставьте адрес вебхука (его создаёт получатель: Discord, Slack, Telegram или ваш сервис) и выберите события. Для своего сервиса отправляем POST с JSON и подписью HMAC-SHA256 в заголовке X-Pleiades-Signature; только https и публичные адреса.",
			en: "Paste a webhook URL (the receiver creates it: Discord, Slack, Telegram or your own service) and pick the events. For your own service we POST JSON signed with HMAC-SHA256 in the X-Pleiades-Signature header; https and public addresses only.",
			kk: "Вебхук мекенжайын қойыңыз (оны қабылдаушы жасайды: Discord, Slack, Telegram немесе өз қызметіңіз) және оқиғаларды таңдаңыз. Өз қызметіңізге X-Pleiades-Signature тақырыбында HMAC-SHA256 қолтаңбасы бар JSON-ды POST арқылы жібереміз; тек https және ашық мекенжайлар.",
		}),
		columns: {
			name: t({ ru: "Название", en: "Name", kk: "Атауы" }),
			type: t({ ru: "Тип", en: "Type", kk: "Түрі" }),
			url: t({ ru: "Адрес", en: "URL", kk: "Мекенжай" }),
			events: t({ ru: "События", en: "Events", kk: "Оқиғалар" }),
			enabled: t({ ru: "Включён", en: "Enabled", kk: "Қосулы" }),
			status: t({
				ru: "Последняя доставка",
				en: "Last delivery",
				kk: "Соңғы жеткізу",
			}),
		},
		never: t({ ru: "ещё не было", en: "none yet", kk: "әлі жоқ" }),
		empty: t({
			ru: "Вебхуков пока нет",
			en: "No webhooks yet",
			kk: "Вебхуктар әлі жоқ",
		}),
		toggle: t({
			ru: "Включить или выключить",
			en: "Enable or disable",
			kk: "Қосу немесе өшіру",
		}),
		events: {
			"webhook.test": t({
				ru: "Проверка вебхука",
				en: "Webhook test",
				kk: "Вебхукті тексеру",
			}),
			"run.failed": t({
				ru: "Ошибка запроса",
				en: "Request failed",
				kk: "Сұраныс қатесі",
			}),
			"guardrail.blocked": t({
				ru: "Сообщение заблокировано защитой",
				en: "Message blocked by a guardrail",
				kk: "Хабарлама қорғаныспен бұғатталды",
			}),
			"ip.blocked": t({
				ru: "IP заблокирован",
				en: "IP blocked",
				kk: "IP бұғатталды",
			}),
			"balance.low": t({
				ru: "Баланс заканчивается",
				en: "Balance running low",
				kk: "Баланс таусылып барады",
			}),
			"balance.depleted": t({
				ru: "Баланс исчерпан, каналы остановлены",
				en: "Balance used up, channels stopped",
				kk: "Баланс таусылды, арналар тоқтатылды",
			}),
		},
		editDialog: {
			title: t({
				ru: "Изменить вебхук",
				en: "Edit webhook",
				kk: "Вебхукті өзгерту",
			}),
		},
		actions: {
			edit: t({ ru: "Изменить", en: "Edit", kk: "Өзгерту" }),
			test: t({
				ru: "Отправить проверку",
				en: "Send test",
				kk: "Тексеру жіберу",
			}),
			rotate: t({
				ru: "Обновить секрет",
				en: "Rotate secret",
				kk: "Құпияны жаңарту",
			}),
			remove: t({ ru: "Удалить", en: "Delete", kk: "Жою" }),
		},
		rotateDialog: {
			title: t({
				ru: "Обновить секрет?",
				en: "Rotate the secret?",
				kk: "Құпияны жаңарту керек пе?",
			}),
			description: t({
				ru: "Старый секрет перестанет подходить: подписи будут новыми, получателя придётся обновить.",
				en: "The old secret stops matching: signatures change, so the receiver must be updated.",
				kk: "Ескі құпия жарамсыз болады: қолтаңбалар өзгереді, қабылдаушыны жаңарту керек.",
			}),
		},
		removeDialog: {
			title: t({
				ru: "Удалить вебхук?",
				en: "Delete this webhook?",
				kk: "Вебхукті жою керек пе?",
			}),
			description: t({
				ru: "Уведомления на этот адрес прекратятся.",
				en: "Notifications to this address stop.",
				kk: "Бұл мекенжайға хабарламалар тоқтайды.",
			}),
		},
		form: {
			title: t({ ru: "Новый вебхук", en: "New webhook", kk: "Жаңа вебхук" }),
			url: t({
				ru: "Адрес (https)",
				en: "URL (https)",
				kk: "Мекенжай (https)",
			}),
			events: t({ ru: "События", en: "Events", kk: "Оқиғалар" }),
			confirm: t({ ru: "Подтвердить", en: "Confirm", kk: "Растау" }),
			name: t({ ru: "Название", en: "Name", kk: "Атауы" }),
			format: t({ ru: "Тип", en: "Type", kk: "Түрі" }),
		},
		formats: {
			json: t({
				ru: "Свой сервис (JSON)",
				en: "Own service (JSON)",
				kk: "Өз қызметім (JSON)",
			}),
			discord: t({ ru: "Discord", en: "Discord", kk: "Discord" }),
			slack: t({ ru: "Slack", en: "Slack", kk: "Slack" }),
			telegram: t({ ru: "Telegram", en: "Telegram", kk: "Telegram" }),
		},
		urlHints: {
			json: t({
				ru: "Ваш https-адрес; подпись и секрет покажем после подтверждения.",
				en: "Your https URL; the signature secret is shown after you confirm.",
				kk: "Сіздің https мекенжайыңыз; қолтаңба құпиясы растағаннан кейін көрсетіледі.",
			}),
			discord: t({
				ru: "Настройки канала Discord, «Интеграции», «Вебхуки», «Копировать URL».",
				en: "Discord channel settings, Integrations, Webhooks, Copy Webhook URL.",
				kk: "Discord арнасының баптаулары, «Интеграциялар», «Вебхуктар», URL көшіру.",
			}),
			slack: t({
				ru: "Входящий вебхук приложения Slack (Incoming Webhooks).",
				en: "A Slack app's Incoming Webhook URL.",
				kk: "Slack қолданбасының Incoming Webhook мекенжайы.",
			}),
			telegram: t({
				ru: "https://api.telegram.org/bot<токен>/sendMessage?chat_id=<id чата>",
				en: "https://api.telegram.org/bot<token>/sendMessage?chat_id=<chat id>",
				kk: "https://api.telegram.org/bot<токен>/sendMessage?chat_id=<чат id>",
			}),
		},
		secret: {
			title: t({
				ru: "Секрет подписи",
				en: "Signing secret",
				kk: "Қолтаңба құпиясы",
			}),
			once: t({
				ru: "Скопируйте секрет сейчас: он показывается один раз, потом его можно только обновить.",
				en: "Copy the secret now: it is shown once, afterwards it can only be rotated.",
				kk: "Құпияны қазір көшіріңіз: ол бір рет көрсетіледі, кейін тек жаңартуға болады.",
			}),
			copy: t({
				ru: "Копировать секрет",
				en: "Copy secret",
				kk: "Құпияны көшіру",
			}),
			done: t({ ru: "Готово", en: "Done", kk: "Дайын" }),
		},
		errors: {
			eventsRequired: t({
				ru: "Выберите хотя бы одно событие",
				en: "Pick at least one event",
				kk: "Кемінде бір оқиғаны таңдаңыз",
			}),
		},
	},
} satisfies Dictionary;

export default webhooksContent;
