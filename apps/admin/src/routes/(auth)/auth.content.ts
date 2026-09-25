import { type Dictionary, insert, t } from "intlayer";

const authContent = {
	key: "auth",
	content: {
		fields: {
			name: t({ ru: "Имя", en: "Name", kk: "Аты" }),
			email: t({ ru: "Почта", en: "Email", kk: "Пошта" }),
			password: t({ ru: "Пароль", en: "Password", kk: "Құпиясөз" }),
		},
		login: {
			title: t({ ru: "Вход", en: "Sign in", kk: "Кіру" }),
			subtitle: t({
				ru: "Админка Pleiades",
				en: "Pleiades admin panel",
				kk: "Pleiades әкімші панелі",
			}),
			submit: t({ ru: "Войти", en: "Sign in", kk: "Кіру" }),
		},
		register: {
			title: t({
				ru: "Первый администратор",
				en: "First administrator",
				kk: "Бірінші әкімші",
			}),
			subtitle: t({
				ru: "Администраторов ещё нет. Эта учётная запись станет первой; после неё регистрация закроется, и новых администраторов можно будет создать только из админки.",
				en: "There are no administrators yet. This account becomes the first one; after that sign-up closes and new administrators can only be created from the admin panel.",
				kk: "Әзірге әкімшілер жоқ. Бұл тіркелгі бірінші болады; одан кейін тіркелу жабылады, ал жаңа әкімшілерді тек әкімші панелінен құруға болады.",
			}),
			submit: t({
				ru: "Создать и войти",
				en: "Create and sign in",
				kk: "Құру және кіру",
			}),
		},
		errors: {
			missing_credentials: t({
				ru: "Укажите почту и пароль",
				en: "Enter your email and password",
				kk: "Пошта мен құпиясөзді енгізіңіз",
			}),
			invalid_credentials: t({
				ru: "Неверная почта или пароль",
				en: "Wrong email or password",
				kk: "Пошта немесе құпиясөз қате",
			}),
			weak_credentials: t({
				ru: insert("Почта обязательна, пароль — не короче {{min}} символов"),
				en: insert(
					"Email is required, password must be at least {{min}} characters",
				),
				kk: insert(
					"Пошта міндетті, құпиясөз кемінде {{min}} таңба болуы керек",
				),
			}),
			registration_closed: t({
				ru: "Регистрация закрыта",
				en: "Sign-up is closed",
				kk: "Тіркелу жабық",
			}),
			signup_failed: t({
				ru: "Не удалось зарегистрироваться",
				en: "Sign-up failed",
				kk: "Тіркелу сәтсіз аяқталды",
			}),
		},
	},
} satisfies Dictionary;

export default authContent;
