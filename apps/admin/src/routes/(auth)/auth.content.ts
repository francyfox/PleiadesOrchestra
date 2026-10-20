import { type Dictionary, insert, t } from "intlayer";

const authContent = {
	key: "auth",
	content: {
		fields: {
			name: t({ ru: "Имя", en: "Name", kk: "Аты" }),
			email: t({ ru: "Почта", en: "Email", kk: "Пошта" }),
			password: t({ ru: "Пароль", en: "Password", kk: "Құпиясөз" }),
			newPassword: t({
				ru: "Новый пароль",
				en: "New password",
				kk: "Жаңа құпиясөз",
			}),
			token: t({
				ru: "Токен доступа",
				en: "Access token",
				kk: "Қол жеткізу токені",
			}),
		},
		login: {
			title: t({
				ru: "Вход для администраторов",
				en: "Staff sign in",
				kk: "Әкімшілерге кіру",
			}),
			subtitle: t({
				ru: "Админка Pleiades. Токен выдаёт супер-админ.",
				en: "Pleiades admin panel. The super admin issues your token.",
				kk: "Pleiades әкімші панелі. Токенді супер-әкімші береді.",
			}),
			submit: t({ ru: "Войти", en: "Sign in", kk: "Кіру" }),
			setup: t({
				ru: "Администраторов ещё нет. Создайте первого на сервере: bun --cwd apps/admin-api run admin:create --email you@example.com",
				en: "There are no administrators yet. Create the first one on the server: bun --cwd apps/admin-api run admin:create --email you@example.com",
				kk: "Әзірге әкімшілер жоқ. Біріншісін серверде құрыңыз: bun --cwd apps/admin-api run admin:create --email you@example.com",
			}),
			customer: t({
				ru: "Вы клиент? Войти по почте",
				en: "A customer? Sign in with your email",
				kk: "Сіз клиентсіз бе? Пошта арқылы кіру",
			}),
		},
		userLogin: {
			title: t({ ru: "Вход", en: "Sign in", kk: "Кіру" }),
			subtitle: t({
				ru: "Личный кабинет Pleiades",
				en: "Your Pleiades account",
				kk: "Pleiades жеке кабинеті",
			}),
			submit: t({ ru: "Войти", en: "Sign in", kk: "Кіру" }),
			register: t({
				ru: "Создать аккаунт",
				en: "Create an account",
				kk: "Тіркелгі құру",
			}),
			forgot: t({
				ru: "Забыли пароль?",
				en: "Forgot your password?",
				kk: "Құпиясөзді ұмыттыңыз ба?",
			}),
			verified: t({
				ru: "Почта подтверждена. Теперь можно войти.",
				en: "Email confirmed. You can sign in now.",
				kk: "Пошта расталды. Енді кіруге болады.",
			}),
			notVerified: t({
				ru: "Ссылка недействительна или устарела. Войдите — мы пришлём новое письмо.",
				en: "The link is invalid or has expired. Sign in and we will send a new one.",
				kk: "Сілтеме жарамсыз немесе ескірген. Кіріңіз — жаңа хат жібереміз.",
			}),
		},
		register: {
			title: t({
				ru: "Создать аккаунт",
				en: "Create an account",
				kk: "Тіркелгі құру",
			}),
			subtitle: t({
				ru: "Мы пришлём письмо со ссылкой для подтверждения почты.",
				en: "We will send you an email with a link to confirm your address.",
				kk: "Поштаны растау үшін сілтемесі бар хат жібереміз.",
			}),
			submit: t({ ru: "Зарегистрироваться", en: "Sign up", kk: "Тіркелу" }),
			sent: t({
				ru: insert(
					"Мы отправили ссылку для подтверждения на {{email}}. Проверьте почту: без ссылки войти не получится.",
				),
				en: insert(
					"We sent a confirmation link to {{email}}. Check your email: you can't sign in without it.",
				),
				kk: insert(
					"Растау сілтемесін {{email}} поштасына жібердік. Поштаңызды тексеріңіз: онсыз кіру мүмкін емес.",
				),
			}),
			hasAccount: t({
				ru: "Уже есть аккаунт? Войти",
				en: "Have an account? Sign in",
				kk: "Тіркелгіңіз бар ма? Кіру",
			}),
		},
		forgot: {
			title: t({
				ru: "Сброс пароля",
				en: "Reset your password",
				kk: "Құпиясөзді қалпына келтіру",
			}),
			subtitle: t({
				ru: "Укажите почту аккаунта — пришлём ссылку для нового пароля.",
				en: "Enter your account email and we will send a link to choose a new password.",
				kk: "Тіркелгі поштасын енгізіңіз — жаңа құпиясөзге сілтеме жібереміз.",
			}),
			submit: t({
				ru: "Отправить ссылку",
				en: "Send the link",
				kk: "Сілтемені жіберу",
			}),
			sent: t({
				ru: insert("Если аккаунт с почтой {{email}} есть, письмо уже в пути."),
				en: insert(
					"If an account with {{email}} exists, the email is on its way.",
				),
				kk: insert("{{email}} поштасы бар тіркелгі болса, хат жолда."),
			}),
			back: t({
				ru: "Назад ко входу",
				en: "Back to sign in",
				kk: "Кіруге оралу",
			}),
		},
		reset: {
			title: t({
				ru: "Новый пароль",
				en: "Choose a new password",
				kk: "Жаңа құпиясөз таңдаңыз",
			}),
			submit: t({
				ru: "Сохранить пароль",
				en: "Save password",
				kk: "Құпиясөзді сақтау",
			}),
			done: t({
				ru: "Пароль изменён. Теперь можно войти.",
				en: "Password changed. You can sign in now.",
				kk: "Құпиясөз өзгертілді. Енді кіруге болады.",
			}),
			noToken: t({
				ru: "В ссылке нет токена. Запросите сброс пароля заново.",
				en: "The link has no token. Request a new password reset.",
				kk: "Сілтемеде токен жоқ. Құпиясөзді қалпына келтіруді қайта сұраңыз.",
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
			invalid_token: t({
				ru: "Токен или ссылка недействительны либо устарели",
				en: "The token or link is invalid or has expired",
				kk: "Токен немесе сілтеме жарамсыз немесе ескірген",
			}),
			banned: t({
				ru: "Эта учётная запись заблокирована",
				en: "This account is banned",
				kk: "Бұл тіркелгі бұғатталған",
			}),
			email_not_verified: t({
				ru: "Почта не подтверждена. Мы отправили письмо ещё раз.",
				en: "Your email isn't confirmed yet. We sent the email again.",
				kk: "Пошта расталмаған. Хатты қайта жібердік.",
			}),
			invalid_email: t({
				ru: "Проверьте адрес почты",
				en: "Check the email address",
				kk: "Пошта мекенжайын тексеріңіз",
			}),
			too_many_attempts: t({
				ru: "Слишком много попыток. Попробуйте позже.",
				en: "Too many attempts. Try again later.",
				kk: "Тым көп әрекет. Кейінірек қайталаңыз.",
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
			weak_password: t({
				ru: insert("Пароль — не короче {{min}} символов"),
				en: insert("Password must be at least {{min}} characters"),
				kk: insert("Құпиясөз кемінде {{min}} таңба болуы керек"),
			}),
			signup_failed: t({
				ru: "Не удалось зарегистрироваться",
				en: "Sign-up failed",
				kk: "Тіркелу сәтсіз аяқталды",
			}),
			failed: t({
				ru: "Не получилось. Попробуйте ещё раз.",
				en: "That didn't work. Try again.",
				kk: "Болмады. Қайталап көріңіз.",
			}),
		},
	},
} satisfies Dictionary;

export default authContent;
