export type UserStatus = "allowed" | "pending" | "blocked";

export interface AccessChannel {
	accessMode: "whitelist" | "open";
	disabledAt: number | null;
}

export interface AccessUser {
	blockedAt: number | null;
	whitelistedAt: number | null;
}

/**
 * The user's own status as shown in the admin panel. Blocking beats
 * whitelisting; a channel being disabled is deliberately not reflected here
 * (it's visible on the channel itself).
 */
export function userStatus(
	channel: AccessChannel,
	user: AccessUser,
): UserStatus {
	if (user.blockedAt !== null) return "blocked";
	if (channel.accessMode === "whitelist" && user.whitelistedAt === null) {
		return "pending";
	}
	return "allowed";
}

/** Whether the orchestrator should answer this user at all. */
export function isAllowed(channel: AccessChannel, user: AccessUser): boolean {
	return channel.disabledAt === null && userStatus(channel, user) === "allowed";
}
