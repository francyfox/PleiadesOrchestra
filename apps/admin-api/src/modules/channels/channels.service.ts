import { isStaff } from "../accounts/accounts.schema.ts";
import type { OrchestratorClient } from "../orchestrator/orchestrator.ts";

const SLUG = /^[a-z0-9-]+$/;
const LANGUAGE = /^[a-z]{2}(-[A-Z]{2})?$/;

/** Channel slugs are lowercase letters, digits and dashes. */
export function isValidSlug(slug: string): boolean {
	return SLUG.test(slug);
}

/** A language code (`ru`, `en`, `pt-BR`), not a language name. */
export function isValidLanguage(language: string): boolean {
	return LANGUAGE.test(language);
}

interface Account {
	id: string;
	level: number;
}

/** The owner a request is scoped to: a user's own id (never from the client), `undefined` = staff, no scope. */
export const ownerScope = (account: Account) =>
	isStaff(account.level) ? undefined : account.id;

/**
 * Whether `account` may touch channel `channelId`: staff any, a user only their own.
 * shortcut: lists the owner's channels (no get-by-id upstream); add one when a user may own hundreds.
 */
export async function mayAccessChannel(
	orchestrator: OrchestratorClient,
	account: Account,
	channelId: string,
): Promise<boolean> {
	const ownerId = ownerScope(account);
	if (!ownerId) return true;
	const { items } = await orchestrator.listChannels({ ownerId });
	return items.some((channel) => channel.id === channelId);
}
