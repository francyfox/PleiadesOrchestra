import type { Mail } from "./mail.types.ts";

type Kind = "verify" | "reset";

const TEXT = {
	en: {
		verify: ["Confirm your email", "Open the link to confirm your email:"],
		reset: ["Reset your password", "Open the link to choose a new password:"],
	},
	ru: {
		verify: ["Подтвердите email", "Откройте ссылку, чтобы подтвердить email:"],
		reset: ["Сброс пароля", "Откройте ссылку, чтобы задать новый пароль:"],
	},
} as const;

/** Only ru and en have texts; any other locale (or none) gets en. */
export function buildMail(
	kind: Kind,
	to: string,
	link: string,
	locale?: string | null,
): Mail {
	const [subject, lead] = TEXT[locale === "ru" ? "ru" : "en"][kind];
	return { to, subject, link, body: `${lead}\n${link}` };
}
