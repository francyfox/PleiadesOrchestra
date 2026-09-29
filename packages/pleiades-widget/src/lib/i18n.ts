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
		mode: "Tool integration",
		webmcp: "WebMCP",
		mcp: "MCP",
		webmcpHint: "Requires Chrome 155+. Experimental — for future use.",
	},
	ru: {
		title: "Ассистент",
		hello: "Здравствуйте! Чем помочь?",
		ph: "Введите сообщение…",
		send: "Отправить",
		stop: "Остановить",
		open: "Открыть чат",
		close: "Закрыть чат",
		forbidden: "Ассистент здесь недоступен.",
		rate_limited: "Слишком много сообщений — подождите немного.",
		too_long: "Сообщение слишком длинное.",
		network: "Нет соединения. Переподключаемся…",
		failed: "Что-то пошло не так. Попробуйте ещё раз.",
		mode: "Режим интеграции",
		webmcp: "WebMCP",
		mcp: "MCP",
		webmcpHint: "Требуется Chrome 155+. Экспериментально — задел на будущее.",
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
		mode: "Құрал интеграциясы",
		webmcp: "WebMCP",
		mcp: "MCP",
		webmcpHint: "Chrome 155+ қажет. Эксперименттік — болашаққа арналған.",
	},
} as const;

export type Lang = keyof typeof strings;
export type Strings = (typeof strings)[Lang];

/** The widget's language: the `lang` attribute, else the page's, else the browser's; English if unsupported. */
export function pickLang(value?: string | null): Lang {
	const code = value?.slice(0, 2).toLowerCase();
	return code && code in strings ? (code as Lang) : "en";
}
