import { type Dictionary, insert, t } from "intlayer";

const modelsContent = {
	key: "models",
	content: {
		title: t({ ru: "Модели", en: "Models", kk: "Модельдер" }),
		subtitle: t({
			ru: "Провайдеры, их модели и параметры вызова (providers.toml). Агенты выбирают модель отсюда.",
			en: "Providers, their models and call parameters (providers.toml). Agents pick their model from here.",
			kk: "Провайдерлер, олардың модельдері мен шақыру параметрлері (providers.toml). Агенттер модельді осыдан таңдайды.",
		}),
		loading: t({ ru: "Загрузка…", en: "Loading…", kk: "Жүктелуде…" }),
		edit: t({ ru: "Изменить", en: "Edit", kk: "Өзгерту" }),
		providers: {
			title: t({ ru: "Провайдеры", en: "Providers", kk: "Провайдерлер" }),
			add: t({ ru: "Провайдер", en: "Provider", kk: "Провайдер" }),
			empty: t({
				ru: "Провайдеров нет",
				en: "No providers",
				kk: "Провайдерлер жоқ",
			}),
			columns: {
				name: t({ ru: "Провайдер", en: "Provider", kk: "Провайдер" }),
				baseUrl: t({ ru: "Base URL", en: "Base URL", kk: "Base URL" }),
				key: t({ ru: "Ключ", en: "Key", kk: "Кілт" }),
				models: t({ ru: "Моделей", en: "Models", kk: "Модельдер" }),
			},
			noKey: t({ ru: "без ключа", en: "no key", kk: "кілтсіз" }),
			deleteTitle: t({
				ru: insert("Удалить провайдера «{{name}}» вместе с моделями?"),
				en: insert("Delete provider “{{name}}” with its models?"),
				kk: insert("«{{name}}» провайдерін модельдерімен бірге жою керек пе?"),
			}),
			deleteDescription: t({
				ru: "Агенты на его моделях вернутся к серверу из env.",
				en: "Agents on its models fall back to their env server.",
				kk: "Оның модельдеріндегі агенттер env серверіне оралады.",
			}),
		},
		/** Model types are shown in English everywhere (AI SDK names); only "All" is translated. */
		allTypes: t({ ru: "Все", en: "All", kk: "Барлығы" }),
		models: {
			title: t({ ru: "Модели", en: "Models", kk: "Модельдер" }),
			add: t({ ru: "Модель", en: "Model", kk: "Модель" }),
			empty: t({
				ru: "Моделей нет — сначала добавьте провайдера",
				en: "No models — add a provider first",
				kk: "Модельдер жоқ — алдымен провайдер қосыңыз",
			}),
			columns: {
				types: t({ ru: "Типы", en: "Types", kk: "Түрлері" }),
				model: t({ ru: "Модель", en: "Model", kk: "Модель" }),
				provider: t({ ru: "Провайдер", en: "Provider", kk: "Провайдер" }),
				temperature: t({
					ru: "Температура",
					en: "Temperature",
					kk: "Температура",
				}),
				effort: t({
					ru: "Reasoning effort",
					en: "Reasoning effort",
					kk: "Reasoning effort",
				}),
				extra: t({
					ru: "Доп. поля",
					en: "Extra fields",
					kk: "Қосымша өрістер",
				}),
			},
			deleteTitle: t({
				ru: insert("Удалить модель «{{name}}»?"),
				en: insert("Delete model “{{name}}”?"),
				kk: insert("«{{name}}» моделін жою керек пе?"),
			}),
			deleteDescription: t({
				ru: "Агенты на ней вернутся к серверу из env.",
				en: "Agents on it fall back to their env server.",
				kk: "Ондағы агенттер env серверіне оралады.",
			}),
		},
		form: {
			providerTitle: t({ ru: "Провайдер", en: "Provider", kk: "Провайдер" }),
			modelTitle: t({ ru: "Модель", en: "Model", kk: "Модель" }),
			id: t({ ru: "Id", en: "Id", kk: "Id" }),
			idHint: t({
				ru: "Латиница в нижнем регистре, цифры и дефис; потом не меняется.",
				en: "Lowercase latin letters, digits and dashes; can't be changed later.",
				kk: "Кіші латын әріптері, сандар және сызықша; кейін өзгертілмейді.",
			}),
			name: t({ ru: "Название", en: "Name", kk: "Атауы" }),
			apiKey: t({ ru: "API-ключ", en: "API key", kk: "API кілті" }),
			apiKeyHint: t({
				ru: "Пусто — оставить сохранённый. $ИМЯ — взять из переменной окружения.",
				en: "Empty keeps the saved one. $NAME reads it from an environment variable.",
				kk: "Бос — сақталғанын қалдыру. $АТЫ — орта айнымалысынан алу.",
			}),
			provider: t({ ru: "Провайдер", en: "Provider", kk: "Провайдер" }),
			types: t({ ru: "Типы модели", en: "Model types", kk: "Модель түрлері" }),
			typesSearch: t({
				ru: "Поиск типа…",
				en: "Search types…",
				kk: "Түрді іздеу…",
			}),
			typesClear: t({
				ru: "Очистить типы",
				en: "Clear types",
				kk: "Түрлерді тазалау",
			}),
			typesRemove: t({
				ru: insert("Убрать {{label}}"),
				en: insert("Remove {{label}}"),
				kk: insert("{{label}} алып тастау"),
			}),
			typesEmpty: t({
				ru: "Нет такого типа",
				en: "No such type",
				kk: "Мұндай түр жоқ",
			}),
			decisionsUrl: t({
				ru: "Адрес решений (Decisions URL)",
				en: "Decisions URL",
				kk: "Шешімдер мекенжайы (Decisions URL)",
			}),
			decisionsUrlHint: t({
				ru: "Нужен моделям типа «Решения», если их адрес не Base URL: корень Laya или .../decisions у OpenRouter. Пусто — оставить сохранённый.",
				en: "For decision models whose endpoint is not the Base URL: a Laya root, or OpenRouter's .../decisions. Empty keeps the saved one.",
				kk: "Мекенжайы Base URL емес «Шешімдер» үлгілері үшін: Laya түбірі немесе OpenRouter .../decisions. Бос — сақталғанын қалдыру.",
			}),
			modelId: t({ ru: "Id модели", en: "Model id", kk: "Модель id" }),
			modelIdHint: t({
				ru: "Как его ждёт сервер: google/gemini-2.5-flash, qwen3:1.7b.",
				en: "As the server expects it: google/gemini-2.5-flash, qwen3:1.7b.",
				kk: "Сервер күткендей: google/gemini-2.5-flash, qwen3:1.7b.",
			}),
			modelIdEditHint: t({
				ru: "Как его ждёт сервер. Агенты с этой моделью перейдут на новый id.",
				en: "As the server expects it. Agents using this model move to the new id.",
				kk: "Сервер күткендей. Осы модельдегі агенттер жаңа id-ге ауысады.",
			}),
			temperature: t({
				ru: "Температура",
				en: "Temperature",
				kk: "Температура",
			}),
			unset: t({
				ru: "не задано (по умолчанию сервера)",
				en: "unset (server default)",
				kk: "берілмеген (сервер әдепкісі)",
			}),
			effort: t({
				ru: "Reasoning effort",
				en: "Reasoning effort",
				kk: "Reasoning effort",
			}),
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
		},
		toml: {
			action: t({
				ru: "providers.toml",
				en: "providers.toml",
				kk: "providers.toml",
			}),
			title: t({
				ru: "Редактировать providers.toml",
				en: "Edit providers.toml",
				kk: "providers.toml өңдеу",
			}),
			check: {
				action: t({ ru: "Проверить", en: "Check", kk: "Тексеру" }),
				title: t({
					ru: "Проверить файл (Alt+Shift+L)",
					en: "Check the file (Alt+Shift+L)",
					kk: "Файлды тексеру (Alt+Shift+L)",
				}),
				ok: t({ ru: "Ошибок нет", en: "No errors", kk: "Қате жоқ" }),
				count: t({
					ru: insert("Ошибок: {{count}}"),
					en: insert("{{count}} errors"),
					kk: insert("Қателер: {{count}}"),
				}),
				failed: t({
					ru: "Не удалось проверить файл",
					en: "Could not check the file",
					kk: "Файлды тексеру мүмкін болмады",
				}),
			},
			editorLabel: t({
				ru: "Содержимое providers.toml",
				en: "providers.toml contents",
				kk: "providers.toml мазмұны",
			}),
			hint: t({
				ru: "Ключи показаны маской: оставьте маску — сохранится прежний ключ. Комментарии при сохранении не сохраняются.",
				en: "Keys are masked: leave a mask to keep the saved key. Comments are not kept on save.",
				kk: "Кілттер маскаланған: масканы қалдырсаңыз, бұрынғы кілт сақталады. Сақтағанда түсініктемелер сақталмайды.",
			}),
		},
	},
} satisfies Dictionary;

export default modelsContent;
