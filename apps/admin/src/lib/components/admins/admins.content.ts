import { type Dictionary, insert, t } from "intlayer";

const adminsContent = {
	key: "admins",
	content: {
		title: t({ ru: "Администраторы", en: "Administrators", kk: "Әкімшілер" }),
		columns: {
			name: t({ ru: "Имя", en: "Name", kk: "Аты" }),
			email: t({ ru: "Почта", en: "Email", kk: "Пошта" }),
			status: t({ ru: "Статус", en: "Status", kk: "Күйі" }),
			created: t({ ru: "Создан", en: "Created", kk: "Құрылған" }),
		},
		banned: t({ ru: "заблокирован", en: "banned", kk: "бұғатталған" }),
		active: t({ ru: "активен", en: "active", kk: "белсенді" }),
		changePassword: t({
			ru: "Сменить пароль",
			en: "Change password",
			kk: "Құпиясөзді өзгерту",
		}),
		ban: t({ ru: "Заблокировать", en: "Ban", kk: "Бұғаттау" }),
		unban: t({ ru: "Разблокировать", en: "Unban", kk: "Бұғаттан шығару" }),
		create: {
			title: t({
				ru: "Новый администратор",
				en: "New administrator",
				kk: "Жаңа әкімші",
			}),
			hint: t({
				ru: "Публичная регистрация закрыта — новые учётные записи создаются только здесь.",
				en: "Public sign-up is closed — new accounts are created only here.",
				kk: "Жалпы тіркелу жабық — жаңа тіркелгілер тек осында құрылады.",
			}),
			tempPassword: t({
				ru: "Временный пароль",
				en: "Temporary password",
				kk: "Уақытша құпиясөз",
			}),
		},
		passwordTitle: t({
			ru: insert("Новый пароль для {{email}}"),
			en: insert("New password for {{email}}"),
			kk: insert("{{email}} үшін жаңа құпиясөз"),
		}),
		errors: {
			weak_credentials: t({
				ru: insert("Почта обязательна, пароль — не короче {{min}} символов"),
				en: insert(
					"Email is required, password must be at least {{min}} characters",
				),
				kk: insert(
					"Пошта міндетті, құпиясөз кемінде {{min}} таңба болуы керек",
				),
			}),
			weak_password: t({
				ru: insert("Пароль — не короче {{min}} символов"),
				en: insert("Password must be at least {{min}} characters"),
				kk: insert("Құпиясөз кемінде {{min}} таңба болуы керек"),
			}),
			self: t({
				ru: "Нельзя заблокировать самого себя",
				en: "You can't ban yourself",
				kk: "Өзіңізді бұғаттай алмайсыз",
			}),
			last_admin: t({
				ru: "Нельзя заблокировать последнего активного администратора",
				en: "You can't ban the last active administrator",
				kk: "Соңғы белсенді әкімшіні бұғаттауға болмайды",
			}),
		},
	},
} satisfies Dictionary;

export default adminsContent;
