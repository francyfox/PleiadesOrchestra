import type { HarnessClient } from "./harness-client.ts";

export const TELEGRAM_CHANNEL = "telegram";

export interface TelegramUser {
	id: number;
	username?: string;
	firstName: string;
}

export function displayNameOf(user: TelegramUser): string {
	return user.username ?? user.firstName;
}

/**
 * Whether the harness lets this Telegram user talk to it — the whitelist
 * lives in the orchestrator's DB now, not in this bot's env. Any failure of
 * the check itself counts as "not allowed": an unknown user must never see
 * an error message, so the caller stays silent either way.
 */
export async function isUserAllowed(
	client: Pick<HarnessClient, "checkAccess">,
	user: TelegramUser,
	onError: (error: unknown) => void,
): Promise<boolean> {
	try {
		const { allowed } = await client.checkAccess({
			channel: TELEGRAM_CHANNEL,
			externalUserId: String(user.id),
			displayName: displayNameOf(user),
		});
		return allowed;
	} catch (error) {
		onError(error);
		return false;
	}
}
