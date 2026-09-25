import { type Dictionary, insert, t } from "intlayer";

const errorContent = {
	key: "app-error",
	content: {
		title: t({
			ru: insert("Ошибка {{status}}"),
			en: insert("Error {{status}}"),
			kk: insert("Қате {{status}}"),
		}),
		clientError: t({
			ru: "Ошибка в браузере (сервер ответил нормально). Подробности — в консоли разработчика. Если это случилось во время разработки после изменения зависимостей, перезапустите dev-сервер.",
			en: "An error in the browser (the server responded fine). Details are in the developer console. If this happened in development after dependencies changed, restart the dev server.",
			kk: "Браузердегі қате (сервер қалыпты жауап берді). Толығырақ — әзірлеуші консолінде. Бұл әзірлеу кезінде тәуелділіктер өзгергеннен кейін болса, dev-серверді қайта іске қосыңыз.",
		}),
		orchestratorDown: t({
			ru: "Оркестратор недоступен.",
			en: "The orchestrator is unreachable.",
			kk: "Оркестратор қолжетімсіз.",
		}),
	},
} satisfies Dictionary;

export default errorContent;
