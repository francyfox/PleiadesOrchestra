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
		remove: t({ ru: "Удалить", en: "Delete", kk: "Жою" }),
		superAdmin: t({
			ru: "Супер-админ",
			en: "Super admin",
			kk: "Супер-әкімші",
		}),
		superAdminHint: t({
			ru: "Первый администратор: только он может удалять других администраторов, его пароль и учётную запись другие менять не могут.",
			en: "The first administrator: only they can delete other administrators, and nobody else can change their password or account.",
			kk: "Бірінші әкімші: тек ол басқа әкімшілерді жоя алады, оның құпиясөзі мен тіркелгісін басқалар өзгерте алмайды.",
		}),
		deleteDialog: {
			title: t({
				ru: insert("Удалить администратора {{email}}?"),
				en: insert("Delete administrator {{email}}?"),
				kk: insert("{{email}} әкімшісін жою керек пе?"),
			}),
			description: t({
				ru: "Учётная запись и все её сессии будут удалены безвозвратно.",
				en: "The account and all its sessions will be deleted permanently.",
				kk: "Тіркелгі мен оның барлық сессиялары біржола жойылады.",
			}),
		},
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
				ru: "Нельзя заблокировать или удалить самого себя",
				en: "You can't ban or delete yourself",
				kk: "Өзіңізді бұғаттауға немесе жоюға болмайды",
			}),
			not_super: t({
				ru: "Удалять администраторов может только супер-админ",
				en: "Only the super admin can delete administrators",
				kk: "Әкімшілерді тек супер-әкімші жоя алады",
			}),
			super_protected: t({
				ru: "Супер-админа нельзя заблокировать, удалить или сменить ему пароль",
				en: "The super admin can't be banned, deleted or have their password changed",
				kk: "Супер-әкімшіні бұғаттауға, жоюға немесе құпиясөзін өзгертуге болмайды",
			}),
			not_found: t({
				ru: "Администратор не найден",
				en: "Administrator not found",
				kk: "Әкімші табылмады",
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
