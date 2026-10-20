import { TEMPLATES } from "./generated.ts";

export type MailKind = keyof typeof TEMPLATES;
export type MailLocale = "ru" | "en";

export interface RenderMailInput {
	/** Only `ru` has its own texts; anything else (or none) gets `en`. */
	locale?: string | null;
	/** Must be http(s); throws otherwise. */
	link: string;
	/** Recipient's display name, optional greeting. */
	name?: string | null;
}

export interface RenderedMail {
	subject: string;
	html: string;
	text: string;
}

interface Copy {
	title: string;
	lead: string;
	button: string;
	footer: string;
}

const hello = { en: "Hi, ", ru: "Здравствуйте, " } as const;

const COPY: Record<MailLocale, Record<MailKind, Copy>> = {
	en: {
		verify: {
			title: "Confirm your email",
			lead: "Thanks for signing up. Confirm your email to finish creating your account.",
			button: "Confirm email",
			footer:
				"You got this email because someone signed up to Pleiades with this address. If it wasn't you, just ignore it.",
		},
		reset: {
			title: "Reset your password",
			lead: "We got a request to reset your password. Open the link to choose a new one.",
			button: "Choose a new password",
			footer:
				"You got this email because a password reset was requested for your Pleiades account. If it wasn't you, ignore it: your password stays the same.",
		},
		"email-change": {
			title: "Confirm your new email",
			lead: "You asked to use this address for your Pleiades account. Confirm it to finish the change.",
			button: "Confirm new email",
			footer:
				"You got this email because an email change was requested on a Pleiades account. If it wasn't you, ignore it: nothing changes until the link is opened.",
		},
	},
	ru: {
		verify: {
			title: "Подтвердите email",
			lead: "Спасибо за регистрацию. Подтвердите email, чтобы завершить создание аккаунта.",
			button: "Подтвердить email",
			footer:
				"Вы получили это письмо, потому что кто-то зарегистрировался в Pleiades с этим адресом. Если это были не вы, просто проигнорируйте письмо.",
		},
		reset: {
			title: "Сброс пароля",
			lead: "Мы получили запрос на сброс пароля. Откройте ссылку, чтобы задать новый.",
			button: "Задать новый пароль",
			footer:
				"Вы получили это письмо, потому что для вашего аккаунта Pleiades запросили сброс пароля. Если это были не вы, проигнорируйте письмо: пароль останется прежним.",
		},
		"email-change": {
			title: "Подтвердите новый email",
			lead: "Вы попросили использовать этот адрес для аккаунта Pleiades. Подтвердите его, чтобы завершить смену.",
			button: "Подтвердить новый email",
			footer:
				"Вы получили это письмо, потому что в аккаунте Pleiades запросили смену email. Если это были не вы, проигнорируйте письмо: пока ссылка не открыта, ничего не изменится.",
		},
	},
};

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

export function renderMail(
	kind: MailKind,
	input: RenderMailInput,
): RenderedMail {
	const protocol = URL.canParse(input.link) ? new URL(input.link).protocol : "";
	if (protocol !== "http:" && protocol !== "https:")
		throw new TypeError("mail link must be an http(s) URL");
	const locale: MailLocale = input.locale === "ru" ? "ru" : "en";
	const copy = COPY[locale][kind];
	const greeting = input.name ? `${hello[locale]}${input.name}. ` : "";
	const values: Record<string, string> = {
		...copy,
		lead: greeting + copy.lead,
		link: input.link,
	};
	// One pass, so a value that itself contains `{{x}}` is never expanded again.
	const html = TEMPLATES[kind].replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
		escapeHtml(values[key] ?? ""),
	);
	return {
		subject: copy.title,
		html,
		text: `${values.title}\n\n${values.lead}\n${input.link}\n\n${copy.footer}\n`,
	};
}
