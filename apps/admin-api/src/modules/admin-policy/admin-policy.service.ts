export interface BanCheck {
	actorId: string;
	targetId: string;
	targetBanned: boolean;
	/** Admins that are currently not banned, target included. */
	activeAdmins: number;
	/** The target is a super admin (level 0). */
	targetIsSuper?: boolean;
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
	targetIsSuper,
}: BanCheck): BanRefusal | null {
	if (targetBanned) return null;
	if (actorId === targetId) return "self";
	if (targetIsSuper) return "super_protected";
	if (activeAdmins <= 1) return "last_admin";
	return null;
}

export { MIN_PASSWORD } from "../../forms/auth.schema.ts";

export interface AccountCheck {
	actorId: string;
	/** Level of the signed-in staff account; 0 = super admin. */
	actorLevel: number;
	targetId: string;
}

export type DeleteRefusal = "not_super" | "self";

/** Only a super admin deletes accounts, and never their own. */
export function deleteRefusal({
	actorId,
	actorLevel,
	targetId,
}: AccountCheck): DeleteRefusal | null {
	if (actorLevel !== 0) return "not_super";
	if (targetId === actorId) return "self";
	return null;
}

/** Editing a staff account or rotating its token: your own, or anyone's if you are a super admin. */
export function manageRefusal({
	actorId,
	actorLevel,
	targetId,
}: AccountCheck): "not_super" | null {
	return actorLevel === 0 || actorId === targetId ? null : "not_super";
}

/** Deliberately loose: one `@` and no spaces; the mail bouncing is the real check. */
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+$/.test(value);
