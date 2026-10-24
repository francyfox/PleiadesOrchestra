export const strings = {
	en: {
		title: "Assistant",
		hello: "Hi! How can I help?",
		ph: "Type a message…",
		send: "Send",
		stop: "Stop",
		open: "Open chat",
		close: "Close chat",
		forbidden: "The assistant isn't available here.",
		suspended: "Chat is unavailable right now.",
		rate_limited: "Too many messages — please wait a moment.",
		too_long: "That message is too long.",
		network: "No connection. Reconnecting…",
		failed: "Something went wrong. Please try again.",
		no_tools:
			"No tools available: this browser has no WebMCP and MCP is not connected.",
		request: "That didn't work out.",
		mic: "Dictate",
		micStop: "Stop dictation",
		micBlocked: "Microphone access is blocked in the browser",
		micUnsupported: "Speech recognition API is not supported by this browser",
		try: "Try",
		justNow: "just now",
		progress: "Done {done} of {total}",
		unfinished: "The previous request was not finished. Continue?",
		interrupted: "The request was interrupted",
		tasksLeft: "tasks left: {n}",
		continue: "Continue",
		cancel: "Cancel",
		retry: "Retry",
		cancelled:
			"Request cancelled. The action may already have happened — check the page.",
		language: "Language",
		examples: [
			"What can you help me with here?",
			"Find something for me",
			"Show me what is in my cart",
		],
	},
	ru: {
		title: "Ассистент",
		hello: "Здравствуйте! Чем помочь?",
		ph: "Ввод…",
		send: "Отправить",
		stop: "Остановить",
		open: "Открыть чат",
		close: "Закрыть чат",
		forbidden: "Ассистент здесь недоступен.",
		suspended: "Чат сейчас недоступен.",
		rate_limited: "Слишком много сообщений — подождите немного.",
		too_long: "Сообщение слишком длинное.",
		network: "Нет соединения. Переподключаемся…",
		failed: "Что-то пошло не так. Попробуйте ещё раз.",
		no_tools:
			"Нет доступных инструментов: в этом браузере нет WebMCP, а MCP не подключён.",
		request: "Не получилось это сделать.",
		mic: "Диктовать",
		micStop: "Остановить диктовку",
		micBlocked: "Доступ к микрофону запрещён в браузере",
		micUnsupported: "API распознавания речи не поддерживается этим браузером",
		try: "Попробуйте",
		justNow: "только что",
		progress: "Выполнено {done} из {total}",
		unfinished: "Прошлый запрос не завершён. Продолжить?",
		interrupted: "Запрос прервался",
		tasksLeft: "осталось задач: {n}",
		continue: "Продолжить",
		cancel: "Отмена",
		retry: "Повторить",
		cancelled:
			"Запрос отменён. Действие могло уже выполниться — проверьте страницу.",
		language: "Язык",
		examples: [
			"С чем ты можешь помочь здесь?",
			"Найди мне что-нибудь",
			"Покажи, что у меня в корзине",
		],
	},
	kk: {
		title: "Көмекші",
		hello: "Сәлем! Қалай көмектесе аламын?",
		ph: "Хабарлама жазыңыз…",
		send: "Жіберу",
		stop: "Тоқтату",
		open: "Чатты ашу",
		close: "Чатты жабу",
		forbidden: "Көмекші мұнда қолжетімсіз.",
		suspended: "Чат қазір қолжетімсіз.",
		rate_limited: "Хабарлама тым көп — сәл күтіңіз.",
		too_long: "Хабарлама тым ұзын.",
		network: "Байланыс жоқ. Қайта қосылуда…",
		failed: "Бірдеңе дұрыс болмады. Қайталап көріңіз.",
		no_tools:
			"Қолжетімді құралдар жоқ: бұл браузерде WebMCP жоқ, ал MCP қосылмаған.",
		request: "Бұл орындалмады.",
		mic: "Дыбыстап жазу",
		micStop: "Жазуды тоқтату",
		micBlocked: "Браузерде микрофонға рұқсат жабық",
		micUnsupported: "Бұл браузер сөйлеуді тану API-ін қолдамайды",
		try: "Байқап көріңіз",
		justNow: "жаңа ғана",
		progress: "Орындалды: {done} / {total}",
		unfinished: "Алдыңғы сұрау аяқталмады. Жалғастыру керек пе?",
		interrupted: "Сұрау үзілді",
		tasksLeft: "қалған тапсырмалар: {n}",
		continue: "Жалғастыру",
		cancel: "Бас тарту",
		retry: "Қайталау",
		cancelled:
			"Сұрау тоқтатылды. Әрекет орындалып қойған болуы мүмкін — бетті тексеріңіз.",
		language: "Тіл",
		examples: [
			"Мұнда қандай көмек бере аласың?",
			"Маған бірдеңе тауып бер",
			"Себетімде не бар екенін көрсет",
		],
	},
} as const;

export type Lang = keyof typeof strings;
export type Strings = (typeof strings)[Lang];

/** Each language in its own name, for the picker. */
export const LANG_NAMES: Record<Lang, string> = {
	en: "English",
	ru: "Русский",
	kk: "Қазақша",
};

export function isLang(value: unknown): value is Lang {
	return typeof value === "string" && value in strings;
}

/**
 * The widget's language: the first candidate that maps to a supported language
 * (by its first two letters), in priority order — the visitor's pick, the
 * `lang` attribute, the page's `<html lang>`, the browser's; English if none.
 */
export function pickLang(...candidates: (string | null | undefined)[]): Lang {
	for (const value of candidates) {
		const code = value?.slice(0, 2).toLowerCase();
		if (isLang(code)) return code;
	}
	return "en";
}
