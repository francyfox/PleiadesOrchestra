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
		rate_limited: "Too many messages — please wait a moment.",
		too_long: "That message is too long.",
		network: "No connection. Reconnecting…",
		failed: "Something went wrong. Please try again.",
		no_tools:
			"No tools available: this browser has no WebMCP and MCP is not connected.",
		request: "That didn't work out.",
		mode: "Tool integration",
		webmcp: "WebMCP",
		mcp: "MCP",
		webmcpHint:
			"Experimental Chrome feature (available since version 149). To enable it, open",
		copied: "Copied ✓",
		mic: "Dictate",
		micStop: "Stop dictation",
		micBlocked: "Microphone access is blocked in the browser",
		micUnsupported: "Speech recognition API is not supported by this browser",
		try: "Try",
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
		rate_limited: "Слишком много сообщений — подождите немного.",
		too_long: "Сообщение слишком длинное.",
		network: "Нет соединения. Переподключаемся…",
		failed: "Что-то пошло не так. Попробуйте ещё раз.",
		no_tools:
			"Нет доступных инструментов: в этом браузере нет WebMCP, а MCP не подключён.",
		request: "Не получилось это сделать.",
		mode: "Режим интеграции",
		webmcp: "WebMCP",
		mcp: "MCP",
		webmcpHint:
			"Экспериментальная функция Chrome (доступна с версии 149). Для активации перейдите в",
		copied: "Скопировано ✓",
		mic: "Диктовать",
		micStop: "Остановить диктовку",
		micBlocked: "Доступ к микрофону запрещён в браузере",
		micUnsupported: "API распознавания речи не поддерживается этим браузером",
		try: "Попробуйте",
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
		rate_limited: "Хабарлама тым көп — сәл күтіңіз.",
		too_long: "Хабарлама тым ұзын.",
		network: "Байланыс жоқ. Қайта қосылуда…",
		failed: "Бірдеңе дұрыс болмады. Қайталап көріңіз.",
		no_tools:
			"Қолжетімді құралдар жоқ: бұл браузерде WebMCP жоқ, ал MCP қосылмаған.",
		request: "Бұл орындалмады.",
		mode: "Құрал интеграциясы",
		webmcp: "WebMCP",
		mcp: "MCP",
		webmcpHint:
			"Chrome-дың эксперименттік функциясы (149 нұсқасынан бастап қолжетімді). Қосу үшін мына бетке өтіңіз:",
		copied: "Көшірілді ✓",
		mic: "Дыбыстап жазу",
		micStop: "Жазуды тоқтату",
		micBlocked: "Браузерде микрофонға рұқсат жабық",
		micUnsupported: "Бұл браузер сөйлеуді тану API-ін қолдамайды",
		try: "Байқап көріңіз",
		examples: [
			"Мұнда қандай көмек бере аласың?",
			"Маған бірдеңе тауып бер",
			"Себетімде не бар екенін көрсет",
		],
	},
} as const;

export type Lang = keyof typeof strings;
export type Strings = (typeof strings)[Lang];

/** The widget's language: the `lang` attribute, else the page's, else the browser's; English if unsupported. */
export function pickLang(value?: string | null): Lang {
	const code = value?.slice(0, 2).toLowerCase();
	return code && code in strings ? (code as Lang) : "en";
}
