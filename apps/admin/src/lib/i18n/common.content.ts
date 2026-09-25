import { type Dictionary, t } from "intlayer";

/** Strings shared across pages: statuses, call kinds, generic words. */
const commonContent = {
	key: "common",
	content: {
		appTitle: t({
			ru: "Pleiades — админка",
			en: "Pleiades — admin",
			kk: "Pleiades — әкімші панелі",
		}),
		noData: t({ ru: "нет данных", en: "no data", kk: "дерек жоқ" }),
		emptyTable: t({ ru: "Нет данных", en: "No data", kk: "Дерек жоқ" }),
		yes: t({ ru: "есть", en: "yes", kk: "бар" }),
		no: t({ ru: "нет", en: "no", kk: "жоқ" }),
		cancel: t({ ru: "Отмена", en: "Cancel", kk: "Бас тарту" }),
		save: t({ ru: "Сохранить", en: "Save", kk: "Сақтау" }),
		create: t({ ru: "Создать", en: "Create", kk: "Құру" }),
		delete: t({ ru: "Удалить", en: "Delete", kk: "Жою" }),
		done: t({ ru: "Готово", en: "Done", kk: "Дайын" }),
		failed: t({ ru: "Ошибка", en: "Error", kk: "Қате" }),
		status: {
			allowed: t({ ru: "допущен", en: "allowed", kk: "рұқсат етілген" }),
			pending: t({
				ru: "ждёт белого списка",
				en: "awaiting whitelist",
				kk: "ақ тізімді күтуде",
			}),
			blocked: t({ ru: "заблокирован", en: "blocked", kk: "бұғатталған" }),
		},
		userKind: {
			identified: t({ ru: "известный", en: "identified", kk: "танылған" }),
			anonymous: t({ ru: "анонимный", en: "anonymous", kk: "анонимді" }),
		},
		callKind: {
			generate: t({ ru: "Генерация", en: "Generation", kk: "Генерация" }),
			ingest: t({ ru: "Ingest", en: "Ingest", kk: "Ingest" }),
			decision: t({ ru: "Laya", en: "Laya", kk: "Laya" }),
		},
	},
} satisfies Dictionary;

export default commonContent;
