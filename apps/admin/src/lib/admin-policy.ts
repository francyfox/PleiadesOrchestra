export interface BanCheck {
	actorId: string;
	targetId: string;
	targetBanned: boolean;
	/** Admins that are currently not banned, target included. */
	activeAdmins: number;
}

/**
 * Why banning `targetId` must be refused, or `null` if allowed. The panel
 * must never lock everyone out: there is no public sign-up once an admin
 * exists, so losing the last active admin would be unrecoverable from the UI.
 */
export function banRefusal({
	actorId,
	targetId,
	targetBanned,
	activeAdmins,
}: BanCheck): string | null {
	if (targetBanned) return null;
	if (actorId === targetId) return "Нельзя заблокировать самого себя";
	if (activeAdmins <= 1)
		return "Нельзя заблокировать последнего активного администратора";
	return null;
}
