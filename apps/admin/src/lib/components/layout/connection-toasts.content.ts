import { type Dictionary, t } from "intlayer";

const connectionToastsContent = {
	key: "connection-toasts",
	content: {
		socket: {
			title: t({
				ru: "Соединение с сервером потеряно",
				en: "Connection to the server lost",
				kk: "Сервермен байланыс үзілді",
			}),
			description: t({
				ru: "Пробуем подключиться заново. Показаны последние полученные данные.",
				en: "Reconnecting… The last data received is shown.",
				kk: "Қайта қосылуға тырысамыз. Соңғы алынған деректер көрсетілген.",
			}),
		},
		upstream: {
			title: t({
				ru: "Сервер не отвечает",
				en: "The server isn't responding",
				kk: "Сервер жауап бермейді",
			}),
			description: t({
				ru: "Оркестратор недоступен, данные могут быть устаревшими.",
				en: "The orchestrator is unreachable, so the data may be out of date.",
				kk: "Оркестратор қолжетімсіз, деректер ескірген болуы мүмкін.",
			}),
		},
		restored: t({
			ru: "Соединение восстановлено",
			en: "Connection restored",
			kk: "Байланыс қалпына келді",
		}),
	},
} satisfies Dictionary;

export default connectionToastsContent;
