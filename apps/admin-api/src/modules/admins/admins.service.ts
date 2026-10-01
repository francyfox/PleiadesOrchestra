import { asc, count, eq, isNull, or } from "drizzle-orm";
import type { FetchContext } from "../common/common.types.ts";
import { type AdminDb, schema } from "../database/database.ts";
import type { AdminsPage } from "./admins.schema.ts";

/** Page parameters of `GET /admins`; no `pageSize` means every account. */
export interface PageParams {
	page?: number;
	pageSize?: number;
}

/** Every account in this database is an admin (see `auth.ts`). */
export async function countAdmins(db: AdminDb): Promise<number> {
	const [row] = await db.select({ value: count() }).from(schema.user);
	return row?.value ?? 0;
}

export async function countActiveAdmins(db: AdminDb): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(schema.user)
		.where(or(isNull(schema.user.banned), eq(schema.user.banned, false)));
	return row?.value ?? 0;
}

/**
 * The super admin is whoever registered first — derived from `createdAt`, so
 * there is nothing to migrate and nothing to forge. null on a fresh install.
 */
export async function superAdminId(db: AdminDb): Promise<string | null> {
	const [row] = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.orderBy(asc(schema.user.createdAt), asc(schema.user.id))
		.limit(1);
	return row?.id ?? null;
}

export async function findAdmin(db: AdminDb, id: string) {
	const [row] = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.id, id));
	return row ?? null;
}

/**
 * Two facts about the accounts that, once true, never change — so they are
 * read from the database until they are known and remembered after that
 * (the session endpoint is hit on every panel navigation):
 * - an admin exists: the last active admin can't be banned (`admin-policy`),
 *   so first-run registration never reopens;
 * - who the super admin is: only the super admin can delete accounts, and
 *   never their own.
 */
export function createAdminDirectory(db: AdminDb) {
	let adminExists = false;
	let superId: string | null = null;
	return {
		async hasAdmin(): Promise<boolean> {
			if (!adminExists) adminExists = (await countAdmins(db)) > 0;
			return adminExists;
		},
		async superId(): Promise<string | null> {
			superId ??= await superAdminId(db);
			return superId;
		},
	};
}

export type AdminDirectory = ReturnType<typeof createAdminDirectory>;

/** `GET /api/admins`: oldest first (the super admin leads); `pageSize` omitted → every account. */
export async function fetchAdminsPage(
	{ db, admins }: Pick<FetchContext, "db" | "admins">,
	query: PageParams,
): Promise<AdminsPage> {
	const superId = await admins.superId();
	const ordered = db
		.select()
		.from(schema.user)
		.orderBy(asc(schema.user.createdAt), asc(schema.user.id));
	const rows = query.pageSize
		? await ordered
				.limit(query.pageSize)
				.offset(((query.page ?? 1) - 1) * query.pageSize)
		: await ordered;
	return {
		admins: rows.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			banned: user.banned === true,
			banReason: user.banReason ?? null,
			createdAt: user.createdAt.getTime(),
			isSuper: user.id === superId,
		})),
		total: await countAdmins(db),
	};
}
