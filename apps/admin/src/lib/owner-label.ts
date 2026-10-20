export interface OwnerAccount {
	id: string;
	name: string;
	email: string;
}

/** Who owns a channel: `null` = staff (`ownerId` null); an owner missing from the list (deleted, not loaded yet) shows its raw id. */
export function ownerLabel(
	ownerId: string | null,
	accounts: readonly OwnerAccount[],
): { name: string; email: string | null } | null {
	if (ownerId === null) return null;
	const account = accounts.find((candidate) => candidate.id === ownerId);
	return account
		? { name: account.name, email: account.email }
		: { name: ownerId, email: null };
}
