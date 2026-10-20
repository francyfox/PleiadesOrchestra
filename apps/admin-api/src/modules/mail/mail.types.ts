export interface Mail {
	to: string;
	subject: string;
	/** Full plain-text body. */
	body: string;
	/** The one link in the body; logged instead of sending when SMTP isn't configured. */
	link: string;
}

export interface Mailer {
	/** Never throws: a failed send is logged, the caller (an auth callback) can't do anything about it. */
	send(mail: Mail): Promise<void>;
}
