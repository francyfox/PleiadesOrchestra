import { type Dictionary, insert, t } from "intlayer";

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
		add: t({ ru: "Добавить", en: "Add", kk: "Қосу" }),
		create: t({ ru: "Создать", en: "Create", kk: "Құру" }),
		delete: t({ ru: "Удалить", en: "Delete", kk: "Жою" }),
		done: t({ ru: "Готово", en: "Done", kk: "Дайын" }),
		failed: t({ ru: "Ошибка", en: "Error", kk: "Қате" }),
		copy: t({ ru: "Копировать", en: "Copy", kk: "Көшіру" }),
		copied: t({ ru: "Скопировано", en: "Copied", kk: "Көшірілді" }),
		copyFailed: t({
			ru: "Не удалось скопировать",
			en: "Couldn't copy",
			kk: "Көшіру мүмкін болмады",
		}),
		confirmDeleteTitle: t({
			ru: "Удалить безвозвратно?",
			en: "Delete permanently?",
			kk: "Біржола жою керек пе?",
		}),
		confirmDeleteBody: t({
			ru: "Это действие нельзя отменить.",
			en: "This can't be undone.",
			kk: "Бұл әрекетті қайтару мүмкін емес.",
		}),
		pagination: {
			page: t({
				ru: insert("Страница {{page}} из {{pages}}"),
				en: insert("Page {{page}} of {{pages}}"),
				kk: insert("{{page}} / {{pages}} бет"),
			}),
			total: t({
				ru: insert("Всего: {{count}}"),
				en: insert("Total: {{count}}"),
				kk: insert("Барлығы: {{count}}"),
			}),
			prev: t({ ru: "Назад", en: "Previous", kk: "Артқа" }),
			next: t({ ru: "Вперёд", en: "Next", kk: "Алға" }),
		},
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
			translate: t({ ru: "Перевод", en: "Translation", kk: "Аударма" }),
		},
	},
} satisfies Dictionary;

export default commonContent;
