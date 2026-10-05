import { type Dictionary, t } from "intlayer";

const intentsContent = {
	key: "intents",
	content: {
		title: t({
			ru: "Намерения",
			en: "Intents",
			kk: "Ниеттер",
		}),
		hint: t({
			ru: "Сообщения, по которым классификатор определил намерение. Ответы Laya ждут вашего решения и ни на что не влияют: на их основе сайт учится только после того, как вы их подтвердили или исправили.",
			en: "Messages the classifier decided an intent for. Laya's answers wait for your verdict and change nothing: a site learns from them only once you approve or correct them.",
			kk: "Классификатор ниетін анықтаған хабарламалар. Laya жауаптары сіздің шешіміңізді күтеді және ештеңеге әсер етпейді: сайт олардан тек сіз растағаннан немесе түзеткеннен кейін үйренеді.",
		}),
		empty: t({
			ru: "Пока нечего проверять",
			en: "Nothing to review yet",
			kk: "Әзірге тексеретін ештеңе жоқ",
		}),
		noMatch: t({
			ru: "Под фильтр ничего не подошло",
			en: "Nothing matches the filter",
			kk: "Сүзгіге ештеңе сәйкес келмеді",
		}),
		columns: {
			text: t({ ru: "Сообщение", en: "Message", kk: "Хабарлама" }),
			intent: t({ ru: "Намерение", en: "Intent", kk: "Ниет" }),
			channel: t({ ru: "Канал", en: "Channel", kk: "Арна" }),
			status: t({ ru: "Решение", en: "Verdict", kk: "Шешім" }),
			source: t({ ru: "Метка от", en: "Label by", kk: "Белгіні қойған" }),
			seen: t({ ru: "Раз", en: "Seen", kk: "Рет" }),
			updated: t({ ru: "Обновлено", en: "Updated", kk: "Жаңартылған" }),
		},
		status: {
			pending: t({ ru: "ждёт решения", en: "pending", kk: "шешім күтуде" }),
			approved: t({ ru: "подтверждено", en: "approved", kk: "расталған" }),
			rejected: t({ ru: "отклонено", en: "rejected", kk: "қабылданбаған" }),
		},
		source: {
			laya: t({ ru: "Laya", en: "Laya", kk: "Laya" }),
			admin: t({ ru: "админ", en: "admin", kk: "әкімші" }),
		},
		filters: {
			status: t({ ru: "Решение", en: "Verdict", kk: "Шешім" }),
			allStatuses: t({
				ru: "Любое решение",
				en: "Any verdict",
				kk: "Кез келген шешім",
			}),
			channel: t({ ru: "Канал", en: "Channel", kk: "Арна" }),
			allChannels: t({
				ru: "Все каналы",
				en: "All channels",
				kk: "Барлық арналар",
			}),
			search: t({ ru: "Поиск…", en: "Search…", kk: "Іздеу…" }),
			nothingFound: t({
				ru: "Ничего не найдено",
				en: "Nothing found",
				kk: "Ештеңе табылмады",
			}),
		},
		actions: {
			approve: t({ ru: "Подтвердить", en: "Approve", kk: "Растау" }),
			reject: t({ ru: "Отклонить", en: "Reject", kk: "Қабылдамау" }),
			correct: t({ ru: "Исправить", en: "Correct", kk: "Түзету" }),
			openRequest: t({
				ru: "Открыть запрос",
				en: "Open the request",
				kk: "Сұрауды ашу",
			}),
		},
		correctDialog: {
			title: t({
				ru: "Исправить намерение",
				en: "Correct the intent",
				kk: "Ниетті түзету",
			}),
			description: t({
				ru: "Выбранное намерение будет подтверждено сразу: сайт начнёт отвечать так на это сообщение и похожие.",
				en: "The chosen intent is approved at once: the site will answer this message and similar ones with it.",
				kk: "Таңдалған ниет бірден расталады: сайт осы және ұқсас хабарламаларға солай жауап береді.",
			}),
			save: t({ ru: "Сохранить", en: "Save", kk: "Сақтау" }),
		},
	},
} satisfies Dictionary;

export default intentsContent;
