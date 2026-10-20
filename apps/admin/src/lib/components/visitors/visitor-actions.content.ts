import { type Dictionary, insert, t } from "intlayer";

/** Whitelist/block actions — shared by the visitors list and the visitor card. */
const visitorActionsContent = {
	key: "visitor-actions",
	content: {
		whitelist: t({
			ru: "В белый список",
			en: "Whitelist",
			kk: "Ақ тізімге қосу",
		}),
		unwhitelist: t({
			ru: "Убрать из белого списка",
			en: "Remove from whitelist",
			kk: "Ақ тізімнен алып тастау",
		}),
		block: t({ ru: "Заблокировать", en: "Block", kk: "Бұғаттау" }),
		unblock: t({ ru: "Разблокировать", en: "Unblock", kk: "Бұғаттан шығару" }),
		blockIp: t({
			ru: "Заблокировать IP",
			en: "Block this IP",
			kk: "IP бұғаттау",
		}),
		copyIp: t({ ru: "Копировать IP", en: "Copy IP", kk: "IP көшіру" }),
		updated: t({
			ru: insert("Обновлено: {{count}}"),
			en: insert("Updated: {{count}}"),
			kk: insert("Жаңартылды: {{count}}"),
		}),
		failed: t({ ru: "Ошибка", en: "Error", kk: "Қате" }),
		errors: {
			no_selection: t({
				ru: "Выберите посетителей и действие",
				en: "Select visitors and an action",
				kk: "Келушілер мен әрекетті таңдаңыз",
			}),
		},
	},
} satisfies Dictionary;

export default visitorActionsContent;
