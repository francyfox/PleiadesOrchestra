import { createTransport } from "nodemailer";
import type { Mail, Mailer } from "./mail.types.ts";

export interface MailerConfig {
	host: string;
	port: number;
	user?: string;
	pass?: string;
	from: string;
	log: (line: string) => void;
}

/** SMTP mailer; without `pass` it only logs the subject and link (local dev). */
export function createMailer(config: MailerConfig): Mailer {
	const transport = config.pass
		? createTransport({
				host: config.host,
				port: config.port,
				secure: config.port === 465,
				auth: { user: config.user, pass: config.pass },
			})
		: null;
	return {
		async send(mail: Mail) {
			if (!transport) {
				config.log(`mail to ${mail.to}: ${mail.subject} ${mail.link}`);
				return;
			}
			try {
				await transport.sendMail({
					from: config.from,
					to: mail.to,
					subject: mail.subject,
					text: mail.body,
				});
			} catch (error) {
				config.log(`mail to ${mail.to} failed: ${String(error)}`);
			}
		},
	};
}
