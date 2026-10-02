import { type Dictionary, t } from "intlayer";

const agentsContent = {
	key: "agents",
	content: {
		title: t({ ru: "Агенты", en: "Agents", kk: "Агенттер" }),
		subtitle: t({
			ru: "Модели, к которым обращается оркестратор. Состояние проверяется при открытии страницы.",
			en: "The models the orchestrator talks to. Status is probed when the page is opened.",
			kk: "Оркестратор жүгінетін модельдер. Күйі бетті ашқан кезде тексеріледі.",
		}),
		columns: {
			agent: t({ ru: "Агент", en: "Agent", kk: "Агент" }),
			endpoint: t({ ru: "Адрес", en: "Endpoint", kk: "Мекенжайы" }),
			model: t({ ru: "Модель", en: "Model", kk: "Модель" }),
			status: t({ ru: "Статус", en: "Status", kk: "Күйі" }),
			latency: t({ ru: "Отклик", en: "Latency", kk: "Жауап беру" }),
			checked: t({ ru: "Проверен", en: "Checked", kk: "Тексерілді" }),
		},
		role: {
			text: t({ ru: "текст", en: "text", kk: "мәтін" }),
			decision: t({ ru: "решения", en: "decision", kk: "шешім" }),
			"function-call": t({
				ru: "вызов функций",
				en: "function call",
				kk: "функция шақыру",
			}),
		},
		status: {
			up: t({ ru: "работает", en: "up", kk: "жұмыс істеп тұр" }),
			down: t({ ru: "недоступен", en: "down", kk: "қолжетімсіз" }),
		},
		ms: t({ ru: "мс", en: "ms", kk: "мс" }),
		empty: t({
			ru: "Агенты не настроены",
			en: "No agents configured",
			kk: "Агенттер бапталмаған",
		}),
	},
} satisfies Dictionary;

export default agentsContent;
