export interface BanCheck {
	actorId: string;
	targetId: string;
	targetBanned: boolean;
	/** Admins that are currently not banned, target included. */
	activeAdmins: number;
}

export type BanRefusal = "self" | "last_admin";

/**
 * Why banning `targetId` must be refused (a code the UI localizes), or
 * `null` if allowed. The panel
 * must never lock everyone out: there is no public sign-up once an admin
 * exists, so losing the last active admin would be unrecoverable from the UI.
 */
export function banRefusal({
	actorId,
	targetId,
	targetBanned,
	activeAdmins,
}: BanCheck): BanRefusal | null {
	if (targetBanned) return null;
	if (actorId === targetId) return "self";
	if (activeAdmins <= 1) return "last_admin";
	return null;
}
