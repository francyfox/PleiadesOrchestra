import { isStaff, LEVEL } from "../accounts/accounts.schema.ts";
import { findByEmail } from "../accounts/accounts.service.ts";
import { isEmail } from "../admin-policy/admin-policy.service.ts";
import type { Auth } from "../auth/auth.ts";
import type { AdminDb } from "../database/database.ts";
import { countAdmins, createStaff, rotateToken } from "./admins.service.ts";

export interface CreateArgs {
	name?: string;
	email?: string;
	level?: string;
}

export type CreateResult =
	| { ok: true; token: string; created: boolean }
	| { ok: false; error: string };

/**
 * `admin:create`: a new staff account, or a new token for an existing staff
 * email. Without `--level` the first account is a super admin, later ones admins.
 */
export async function createOrRotateStaff(
	db: AdminDb,
	auth: Auth,
	args: CreateArgs,
): Promise<CreateResult> {
	const email = args.email?.trim().toLowerCase() ?? "";
	if (!isEmail(email)) return { ok: false, error: "--email is required" };
	if (args.level !== undefined && !["0", "100"].includes(args.level)) {
		return { ok: false, error: "--level must be 0 or 100" };
	}
	const existing = await findByEmail(db, email);
	if (existing) {
		if (!isStaff(existing.level)) {
			return { ok: false, error: `${email} is a customer account` };
		}
		return {
			ok: true,
			created: false,
			token: await rotateToken(auth, existing.id),
		};
	}
	const level = args.level
		? (Number(args.level) as 0 | 100)
		: (await countAdmins(db)) === 0
			? LEVEL.super
			: LEVEL.admin;
	const { token } = await createStaff(auth, {
		name: args.name ?? "",
		email,
		level,
	});
	return { ok: true, created: true, token };
}
