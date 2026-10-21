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

/** How often one address may get a verification or reset mail. */
export const MAIL_COOLDOWN_MS = 60_000;

/**
 * `true` (and remembers the send) when `key` got no mail in the last `ms`.
 * shortcut: in memory, per process — a restart resets it; move to the DB if admin-api ever runs replicated.
 */
export function createMailCooldown(ms: number, now: () => number) {
	const sentAt = new Map<string, number>();
	return (key: string) => {
		const at = now();
		const last = sentAt.get(key);
		if (last !== undefined && at - last < ms) return false;
		for (const [old, time] of sentAt) if (at - time >= ms) sentAt.delete(old);
		sentAt.set(key, at);
		return true;
	};
}
