export interface BanCheck {
	actorId: string;
	targetId: string;
	targetBanned: boolean;
	/** Admins that are currently not banned, target included. */
	activeAdmins: number;
	/** The super admin (the first account); omit where no super exists to protect. */
	superId?: string;
}

export type BanRefusal = "self" | "last_admin" | "super_protected";

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
	superId,
}: BanCheck): BanRefusal | null {
	if (targetBanned) return null;
	if (actorId === targetId) return "self";
	if (targetId === superId) return "super_protected";
	if (activeAdmins <= 1) return "last_admin";
	return null;
}

/** Shortest password the panel accepts for an admin account. */
export const MIN_PASSWORD = 8;

export interface AccountCheck {
	actorId: string;
	targetId: string;
	superId: string;
}

export type DeleteRefusal = "not_super" | "self";

/** Only the super admin deletes accounts, and never their own. */
export function deleteRefusal({
	actorId,
	targetId,
	superId,
}: AccountCheck): DeleteRefusal | null {
	if (actorId !== superId) return "not_super";
	if (targetId === actorId) return "self";
	return null;
}

export type PasswordRefusal = "super_protected";

/** The super admin's password is theirs alone to change. */
export function passwordRefusal({
	actorId,
	targetId,
	superId,
}: AccountCheck): PasswordRefusal | null {
	return targetId === superId && actorId !== superId ? "super_protected" : null;
}
