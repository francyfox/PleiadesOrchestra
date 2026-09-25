/** One admin account as the /admins page loads it (better-auth user, flattened). */
export interface AdminRow {
	id: string;
	name: string;
	email: string;
	banned: boolean;
	banReason: string | null;
	createdAt: number;
}
