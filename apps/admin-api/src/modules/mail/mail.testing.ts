import type { Mail, Mailer } from "./mail.types.ts";

/** Records mails instead of sending them. */
export function createFakeMailer(): Mailer & { sent: Mail[] } {
	const sent: Mail[] = [];
	return {
		sent,
		async send(mail) {
			sent.push(mail);
		},
	};
}
