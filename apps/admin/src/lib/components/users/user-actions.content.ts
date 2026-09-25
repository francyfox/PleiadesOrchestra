import { type Dictionary, insert, t } from "intlayer";

/** Whitelist/block actions — shared by the users list and the user card. */
const userActionsContent = {
	key: "user-actions",
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
		updated: t({
			ru: insert("Обновлено: {{count}}"),
			en: insert("Updated: {{count}}"),
			kk: insert("Жаңартылды: {{count}}"),
		}),
		failed: t({ ru: "Ошибка", en: "Error", kk: "Қате" }),
		errors: {
			no_selection: t({
				ru: "Выберите пользователей и действие",
				en: "Select users and an action",
				kk: "Пайдаланушылар мен әрекетті таңдаңыз",
			}),
		},
	},
} satisfies Dictionary;

export default userActionsContent;
