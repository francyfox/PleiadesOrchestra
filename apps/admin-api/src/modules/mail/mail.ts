import { createTransport } from "nodemailer";
import type { Mail, Mailer } from "./mail.types.ts";

export interface MailerConfig {
	host: string;
	port: number;
	user?: string;
	pass?: string;
	from: string;
	log: (line: string) => void;
	/** A mail that didn't go out (logged as an error, so Sentry sees it); defaults to `log`. */
	onError?: (error: Error) => void;
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
			const fail = (reason: unknown) => {
				const error = new Error(
					`mail to ${mail.to} failed: ${String(reason)}`,
					{
						cause: reason,
					},
				);
				(config.onError ?? ((e) => config.log(e.message)))(error);
			};
			try {
				const info = await transport.sendMail({
					from: config.from,
					to: mail.to,
					subject: mail.subject,
					text: mail.text,
					html: mail.html,
				});
				// The server may accept the message yet refuse the recipient.
				if (info.rejected.length > 0) fail(`rejected ${info.response}`);
				else config.log(`mail to ${mail.to} sent: ${mail.subject}`);
			} catch (error) {
				fail(error);
			}
		},
	};
}
