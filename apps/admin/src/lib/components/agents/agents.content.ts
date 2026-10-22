import { type Dictionary, insert, t } from "intlayer";

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
			ping: t({ ru: "Пинг", en: "Ping", kk: "Пинг" }),
			response: t({ ru: "Ответ", en: "Response", kk: "Жауап" }),
			checked: t({ ru: "Проверен", en: "Checked", kk: "Тексерілді" }),
		},
		role: {
			text: t({ ru: "текст", en: "text", kk: "мәтін" }),
			decision: t({ ru: "решения", en: "decision", kk: "шешім" }),
			translate: t({ ru: "перевод", en: "translate", kk: "аударма" }),
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
		settings: {
			action: t({ ru: "Настройки", en: "Settings", kk: "Баптаулар" }),
			title: t({
				ru: insert("Настройки «{{name}}»"),
				en: insert("Settings of “{{name}}”"),
				kk: insert("«{{name}}» баптаулары"),
			}),
			hint: t({
				ru: "Модели и их параметры настраиваются во вкладке «Модели». Выбор действует сразу, без перезапуска; запрос, который уже идёт, дорабатывает на прежней модели.",
				en: "Models and their parameters are set up on the Models tab. A pick applies at once, no restart; a request already running finishes on the old model.",
				kk: "Модельдер мен олардың параметрлері «Модельдер» бетінде бапталады. Таңдау бірден қолданылады, қайта іске қосу керек емес; жүріп жатқан сұрау ескі модельмен аяқталады.",
			}),
			loading: t({ ru: "Загрузка…", en: "Loading…", kk: "Жүктелуде…" }),
			model: t({ ru: "Модель", en: "Model", kk: "Модель" }),
			envServer: t({
				ru: "сервер из env",
				en: "env server",
				kk: "env сервері",
			}),
			test: t({ ru: "Проверить", en: "Test", kk: "Тексеру" }),
			testSent: t({ ru: "Отправлено", en: "Sent", kk: "Жіберілді" }),
			testAnswer: t({ ru: "Ответ", en: "Answer", kk: "Жауап" }),
			testProbability: t({
				ru: "Вероятность «true»",
				en: "Probability of “true”",
				kk: "«true» ықтималдығы",
			}),
			testTokens: t({
				ru: insert("вход {{input}} · выход {{output}}"),
				en: insert("in {{input}} · out {{output}}"),
				kk: insert("кіріс {{input}} · шығыс {{output}}"),
			}),
			testTokensLabel: t({ ru: "Токены", en: "Tokens", kk: "Токендер" }),
			testTime: t({ ru: "Время", en: "Time", kk: "Уақыт" }),
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
