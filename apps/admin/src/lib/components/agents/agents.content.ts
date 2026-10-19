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
		settings: {
			action: t({ ru: "Настройки", en: "Settings", kk: "Баптаулар" }),
			title: t({
				ru: insert("Настройки «{{name}}»"),
				en: insert("Settings of “{{name}}”"),
				kk: insert("«{{name}}» баптаулары"),
			}),
			hint: t({
				ru: "Пустое поле — значение из env (показано серым). Сохранённое действует сразу, без перезапуска; запрос, который уже идёт, дорабатывает на прежней модели.",
				en: "An empty field means the env value (shown in grey). A save applies at once, no restart; a request already running finishes on the old model.",
				kk: "Бос өріс — env мәні (сұр түспен). Сақтау бірден қолданылады, қайта іске қосу керек емес; жүріп жатқан сұрау ескі модельмен аяқталады.",
			}),
			readOnly: t({
				ru: "Решения принимает Laya, она остаётся на своём сервере (из env). Здесь только просмотр.",
				en: "Laya makes the decisions and stays on its own server (from env). View only.",
				kk: "Шешімдерді Laya қабылдайды, ол өз серверінде қалады (env). Тек қарау.",
			}),
			loading: t({ ru: "Загрузка…", en: "Loading…", kk: "Жүктелуде…" }),
			source: t({ ru: "Источник", en: "Source", kk: "Көзі" }),
			local: t({
				ru: "Локальный (env)",
				en: "Local (env)",
				kk: "Жергілікті (env)",
			}),
			external: t({
				ru: "Внешний (OpenAI-совместимый)",
				en: "External (OpenAI-compatible)",
				kk: "Сыртқы (OpenAI-үйлесімді)",
			}),
			baseUrl: t({ ru: "Base URL", en: "Base URL", kk: "Base URL" }),
			model: t({ ru: "Модель", en: "Model", kk: "Модель" }),
			providerKey: t({
				ru: "Ключ провайдера",
				en: "Provider key",
				kk: "Провайдер кілті",
			}),
			noKey: t({ ru: "— без ключа —", en: "— no key —", kk: "— кілтсіз —" }),
			temperature: t({
				ru: "Температура",
				en: "Temperature",
				kk: "Температура",
			}),
			reasoningEffort: t({
				ru: "Reasoning effort",
				en: "Reasoning effort",
				kk: "Reasoning effort",
			}),
			envValue: t({ ru: "из env", en: "from env", kk: "env-тен" }),
			extraBody: t({
				ru: "Доп. поля запроса (JSON)",
				en: "Extra request-body fields (JSON)",
				kk: "Сұраудың қосымша өрістері (JSON)",
			}),
			extraBodyHint: t({
				ru: 'Например {"provider": {"require_parameters": true}} для OpenRouter.',
				en: 'For example {"provider": {"require_parameters": true}} for OpenRouter.',
				kk: 'Мысалы, OpenRouter үшін {"provider": {"require_parameters": true}}.',
			}),
			reset: t({
				ru: "Сбросить на env",
				en: "Reset to env",
				kk: "env-ке қайтару",
			}),
			test: t({ ru: "Проверить", en: "Test", kk: "Тексеру" }),
			testResult: t({
				ru: insert("Ответ: «{{answer}}» за {{ms}} мс"),
				en: insert("Answer: “{{answer}}” in {{ms}} ms"),
				kk: insert("Жауап: «{{answer}}», {{ms}} мс"),
			}),
			errors: {
				invalid_json: t({
					ru: "Доп. поля — это JSON-объект",
					en: "Extra fields must be a JSON object",
					kk: "Қосымша өрістер — JSON нысаны болуы керек",
				}),
			},
		},
		keys: {
			title: t({
				ru: "Ключи провайдеров",
				en: "Provider keys",
				kk: "Провайдер кілттері",
			}),
			hint: t({
				ru: "Один ключ на провайдера (например, openrouter) вводится один раз, агенты выбирают его в настройках. Ключ хранится зашифрованным и больше нигде не показывается.",
				en: "One key per provider (for example openrouter), entered once and picked by the agents in their settings. It is stored encrypted and never shown again.",
				kk: "Провайдерге бір кілт (мысалы, openrouter) бір рет енгізіледі, агенттер оны баптауларда таңдайды. Кілт шифрланып сақталады және қайта көрсетілмейді.",
			}),
			name: t({ ru: "Провайдер", en: "Provider", kk: "Провайдер" }),
			key: t({ ru: "Ключ", en: "Key", kk: "Кілт" }),
			saveHint: t({
				ru: "Тот же провайдер — ключ заменится.",
				en: "The same provider replaces its key.",
				kk: "Сол провайдер — кілт ауыстырылады.",
			}),
			empty: t({
				ru: "Ключей пока нет",
				en: "No keys yet",
				kk: "Кілттер әзірге жоқ",
			}),
			deleteTitle: t({
				ru: insert("Удалить ключ «{{name}}»?"),
				en: insert("Delete key “{{name}}”?"),
				kk: insert("«{{name}}» кілтін жою керек пе?"),
			}),
			deleteDescription: t({
				ru: "Агенты, которые его выбрали, вернутся к значениям из env.",
				en: "Agents that picked it fall back to the env values.",
				kk: "Оны таңдаған агенттер env мәндеріне оралады.",
			}),
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
