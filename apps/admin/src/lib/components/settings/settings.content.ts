import { type Dictionary, insert, t } from "intlayer";

const settingsContent = {
	key: "settings",
	content: {
		title: t({ ru: "Настройки", en: "Settings", kk: "Параметрлер" }),
		profile: {
			title: t({ ru: "Профиль", en: "Profile", kk: "Профиль" }),
			name: t({ ru: "Имя", en: "Name", kk: "Аты" }),
			email: t({ ru: "Новая почта", en: "New email", kk: "Жаңа пошта" }),
			currentEmail: t({
				ru: insert("Сейчас: {{email}}"),
				en: insert("Current: {{email}}"),
				kk: insert("Қазіргі: {{email}}"),
			}),
			changeEmail: t({
				ru: "Сменить почту",
				en: "Change email",
				kk: "Поштаны өзгерту",
			}),
			emailSent: t({
				ru: "Мы отправили ссылку на новый адрес; почта изменится после подтверждения",
				en: "We sent a link to the new address; the email changes after you confirm it",
				kk: "Жаңа мекенжайға сілтеме жібердік; пошта растағаннан кейін өзгереді",
			}),
		},
		inactivity: t({
			ru: insert(
				"Аккаунты без активности 6 месяцев удаляются автоматически. Последняя активность: {{date}}",
			),
			en: insert(
				"Accounts inactive for 6 months are deleted automatically. Last activity: {{date}}",
			),
			kk: insert(
				"6 ай белсенділігі жоқ тіркелгілер автоматты түрде жойылады. Соңғы белсенділік: {{date}}",
			),
		}),
		neverActive: t({ ru: "ещё не было", en: "none yet", kk: "әлі болған жоқ" }),
		danger: {
			title: t({ ru: "Опасная зона", en: "Danger zone", kk: "Қауіпті аймақ" }),
			body: t({
				ru: "Удаление аккаунта удаляет все ваши каналы и данные их посетителей. Это нельзя отменить.",
				en: "Deleting the account deletes all your channels and their visitors' data. It can't be undone.",
				kk: "Тіркелгіні жою барлық арналарыңызды және олардың келушілерінің деректерін жояды. Мұны қайтару мүмкін емес.",
			}),
			action: t({
				ru: "Удалить аккаунт",
				en: "Delete account",
				kk: "Тіркелгіні жою",
			}),
			dialogTitle: t({
				ru: "Удалить аккаунт?",
				en: "Delete your account?",
				kk: "Тіркелгіні жою керек пе?",
			}),
			confirmLabel: t({
				ru: insert("Введите {{email}}, чтобы подтвердить"),
				en: insert("Type {{email}} to confirm"),
				kk: insert("Растау үшін {{email}} енгізіңіз"),
			}),
		},
		errors: {
			invalid_name: t({
				ru: "Укажите имя",
				en: "Enter a name",
				kk: "Атын енгізіңіз",
			}),
			invalid_email: t({
				ru: "Некорректный адрес почты",
				en: "That email address isn't valid",
				kk: "Пошта мекенжайы жарамсыз",
			}),
			same_email: t({
				ru: "Это уже ваша почта",
				en: "That is already your email",
				kk: "Бұл қазірдің өзінде сіздің поштаңыз",
			}),
			confirm_mismatch: t({
				ru: "Почта не совпадает с адресом аккаунта",
				en: "That doesn't match your account email",
				kk: "Пошта тіркелгі мекенжайымен сәйкес келмейді",
			}),
			too_many_attempts: t({
				ru: "Слишком много попыток, попробуйте позже",
				en: "Too many attempts, try again later",
				kk: "Тым көп әрекет, кейінірек қайталаңыз",
			}),
			upstream_unavailable: t({
				ru: "Оркестратор недоступен, аккаунт сохранён",
				en: "The orchestrator is unavailable, the account was kept",
				kk: "Оркестратор қолжетімсіз, тіркелгі сақталды",
			}),
		},
	},
} satisfies Dictionary;

export default settingsContent;
