import { type Dictionary, insert, t } from "intlayer";

const usersContent = {
	key: "users",
	content: {
		title: t({ ru: "Пользователи", en: "Users", kk: "Пайдаланушылар" }),
		columns: {
			name: t({ ru: "Имя", en: "Name", kk: "Аты" }),
			email: t({ ru: "Почта", en: "Email", kk: "Пошта" }),
			created: t({ ru: "Создан", en: "Created", kk: "Құрылған" }),
			lastActive: t({
				ru: "Последняя активность",
				en: "Last active",
				kk: "Соңғы белсенділік",
			}),
			channels: t({ ru: "Каналы", en: "Channels", kk: "Арналар" }),
			status: t({ ru: "Статус", en: "Status", kk: "Күйі" }),
		},
		verified: t({ ru: "подтверждена", en: "verified", kk: "расталған" }),
		unverified: t({
			ru: "не подтверждена",
			en: "unverified",
			kk: "расталмаған",
		}),
		banned: t({ ru: "заблокирован", en: "banned", kk: "бұғатталған" }),
		active: t({ ru: "активен", en: "active", kk: "белсенді" }),
		never: t({ ru: "никогда", en: "never", kk: "ешқашан" }),
		empty: t({
			ru: "Пользователей пока нет",
			en: "No users yet",
			kk: "Пайдаланушылар әлі жоқ",
		}),
		ban: t({ ru: "Заблокировать", en: "Ban", kk: "Бұғаттау" }),
		unban: t({ ru: "Разблокировать", en: "Unban", kk: "Бұғаттан шығару" }),
		remove: t({ ru: "Удалить", en: "Delete", kk: "Жою" }),
		deleteDialog: {
			title: t({
				ru: insert("Удалить пользователя {{email}}?"),
				en: insert("Delete user {{email}}?"),
				kk: insert("{{email}} пайдаланушысын жою керек пе?"),
			}),
			description: t({
				ru: "Будут удалены аккаунт и все его каналы вместе с данными посетителей. Это нельзя отменить.",
				en: "This deletes the account and all its channels with their visitors' data. It can't be undone.",
				kk: "Тіркелгі мен оның барлық арналары, келушілер деректерімен бірге жойылады. Мұны қайтару мүмкін емес.",
			}),
		},
		errors: {
			not_found: t({
				ru: "Пользователь не найден",
				en: "User not found",
				kk: "Пайдаланушы табылмады",
			}),
			upstream_unavailable: t({
				ru: "Оркестратор недоступен, аккаунт сохранён",
				en: "The orchestrator is unavailable, the account was kept",
				kk: "Оркестратор қолжетімсіз, тіркелгі сақталды",
			}),
		},
	},
} satisfies Dictionary;

export default usersContent;
