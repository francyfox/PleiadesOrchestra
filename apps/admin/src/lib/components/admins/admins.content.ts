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
		edit: t({
			ru: "Изменить имя и почту",
			en: "Edit name and email",
			kk: "Аты мен поштасын өзгерту",
		}),
		rotateToken: t({
			ru: "Выдать новый токен",
			en: "Issue a new token",
			kk: "Жаңа токен беру",
		}),
		ban: t({ ru: "Заблокировать", en: "Ban", kk: "Бұғаттау" }),
		unban: t({ ru: "Разблокировать", en: "Unban", kk: "Бұғаттан шығару" }),
		remove: t({ ru: "Удалить", en: "Delete", kk: "Жою" }),
		superAdmin: t({
			ru: "Супер-админ",
			en: "Super admin",
			kk: "Супер-әкімші",
		}),
		admin: t({ ru: "Админ", en: "Admin", kk: "Әкімші" }),
		superAdminHint: t({
			ru: "Супер-админ: создаёт и удаляет администраторов, меняет их имя, почту и токен. Другие не могут его заблокировать или изменить.",
			en: "Super admin: creates and deletes administrators and changes their name, email and token. Nobody else can ban or change them.",
			kk: "Супер-әкімші: әкімшілерді құрады, жояды, олардың атын, поштасын және токенін өзгертеді. Оны басқалар бұғаттай немесе өзгерте алмайды.",
		}),
		rotateDialog: {
			title: t({
				ru: insert("Выдать новый токен для {{email}}?"),
				en: insert("Issue a new token for {{email}}?"),
				kk: insert("{{email}} үшін жаңа токен беру керек пе?"),
			}),
			description: t({
				ru: "Старый токен перестанет работать сразу, все сессии этого администратора будут завершены.",
				en: "The old token stops working at once and all of this administrator's sessions end.",
				kk: "Ескі токен бірден жұмысын тоқтатады, бұл әкімшінің барлық сессиялары аяқталады.",
			}),
		},
		token: {
			title: t({
				ru: insert("Токен доступа для {{email}}"),
				en: insert("Access token for {{email}}"),
				kk: insert("{{email}} үшін қол жеткізу токені"),
			}),
			once: t({
				ru: "Токен показывается один раз: на сервере хранится только его хэш. Скопируйте и передайте администратору.",
				en: "The token is shown once: the server keeps only its hash. Copy it and hand it to the administrator.",
				kk: "Токен бір рет көрсетіледі: серверде тек оның хэші сақталады. Көшіріп, әкімшіге беріңіз.",
			}),
			ownNote: t({
				ru: "Это ваш токен: после закрытия вы выйдете и войдёте уже с ним.",
				en: "This is your own token: closing this window signs you out so you can sign in with it.",
				kk: "Бұл сіздің токеніңіз: терезені жапқанда жүйеден шығасыз да, онымен қайта кіресіз.",
			}),
			close: t({ ru: "Я скопировал", en: "I've copied it", kk: "Көшірдім" }),
		},
		editTitle: t({
			ru: insert("Администратор {{email}}"),
			en: insert("Administrator {{email}}"),
			kk: insert("{{email}} әкімшісі"),
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
				ru: "У администратора нет пароля: после создания вы получите токен доступа (один раз). Почта нужна только для связи.",
				en: "Administrators have no password: after creating you get an access token (once). The email is contact data only.",
				kk: "Әкімшінің құпиясөзі жоқ: құрғаннан кейін қол жеткізу токенін аласыз (бір рет). Пошта тек байланыс үшін.",
			}),
		},
		errors: {
			invalid_email: t({
				ru: "Проверьте адрес почты",
				en: "Check the email address",
				kk: "Пошта мекенжайын тексеріңіз",
			}),
			email_taken: t({
				ru: "Эта почта уже занята другой учётной записью",
				en: "Another account already uses this email",
				kk: "Бұл поштаны басқа тіркелгі қолданып тұр",
			}),
			self: t({
				ru: "Нельзя заблокировать или удалить самого себя",
				en: "You can't ban or delete yourself",
				kk: "Өзіңізді бұғаттауға немесе жоюға болмайды",
			}),
			not_super: t({
				ru: "Это может только супер-админ (свои имя, почту и токен можно менять самому)",
				en: "Only the super admin can do this (you can change your own name, email and token)",
				kk: "Мұны тек супер-әкімші жасай алады (өз атыңызды, поштаңызды және токеніңізді өзіңіз өзгерте аласыз)",
			}),
			super_protected: t({
				ru: "Супер-админа нельзя заблокировать",
				en: "The super admin can't be banned",
				kk: "Супер-әкімшіні бұғаттауға болмайды",
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
