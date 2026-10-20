import { type MailKind, renderMail } from "@repo/mail-templates";
import type { Mail } from "./mail.types.ts";

/** Only ru and en have texts; any other locale (or none) gets en. */
export function buildMail(
	kind: MailKind,
	to: string,
	link: string,
	locale?: string | null,
): Mail {
	return { to, link, ...renderMail(kind, { link, locale }) };
}

/** shortcut: reads the unverified JWT payload only to pick a template, never to trust it. */
export function isEmailChangeToken(token: string): boolean {
	try {
		const payload = token.split(".")[1] ?? "";
		return (
			"updateTo" in JSON.parse(Buffer.from(payload, "base64url").toString())
		);
	} catch {
		return false;
	}
}
